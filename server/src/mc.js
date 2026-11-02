// A MaidCentral portal session for one person: their own cookies, kept on the server.
// Signs in like a browser (login form, then the 2FA "send code" and "verify code" pages)
// and makes READ-ONLY calls. Every call is checked against the crawler's safety rules: a
// GET whose URL names no action, or a POST on the reviewed read list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUnsafeUrl, isReadPost, parseReadPosts } from '../../capture/safety.js';
import { readForms, setField, tickCheckbox, encodeForm, pageErrors } from './forms.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READ_POSTS = parseReadPosts(fs.readFileSync(path.join(HERE, '..', '..', 'capture', 'read-posts.txt'), 'utf8'));
const CODE_INPUT = /code|otp|token(?!$)|verif/i;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export class McError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class McSession {
  constructor(portalUrl, { fetchImpl = fetch } = {}) {
    this.origin = new URL(portalUrl).origin;
    this.host = new URL(portalUrl).host;
    this.jar = new Map(); // cookie name -> { value, expires }
    this.fetch = fetchImpl;
    this.pendingForm = null; // the 2FA form while waiting for a code
    this.signedIn = false;
  }

  cookieHeader() {
    const now = Date.now();
    return [...this.jar].filter(([, c]) => !c.expires || c.expires > now).map(([n, c]) => `${n}=${c.value}`).join('; ');
  }

  storeCookies(res) {
    for (const line of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      let expires = null;
      for (const a of attrs) {
        const [k, v] = a.split('=').map((s) => s?.trim());
        if (/^max-age$/i.test(k)) expires = Date.now() + Number(v) * 1000;
        else if (/^expires$/i.test(k) && !expires) expires = Date.parse(v);
      }
      if (value === '' || (expires && expires <= Date.now())) this.jar.delete(name);
      else this.jar.set(name, { value, expires });
    }
  }

  // One request plus redirects, like a browser (POST -> 302 -> GET).
  async request(method, url, { body, headers = {}, signIn = false } = {}) {
    let target = new URL(url, this.origin).href;
    if (!signIn) assertRead(method, target, this.host, headers);
    for (let hop = 0; hop < 10; hop++) {
      const res = await this.fetch(target, {
        method,
        body,
        redirect: 'manual',
        headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers, cookie: this.cookieHeader() },
      });
      this.storeCookies(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        target = new URL(location, target).href;
        if (new URL(target).origin !== this.origin) throw new McError('offsite', `MaidCentral redirected to another site (${new URL(target).host})`);
        if (res.status !== 307 && res.status !== 308) {
          method = 'GET';
          body = undefined;
          delete headers['content-type'];
        }
        continue;
      }
      return { status: res.status, url: target, text: await res.text(), contentType: res.headers.get('content-type') || '' };
    }
    throw new McError('redirects', 'Too many redirects from MaidCentral');
  }

  async submit(form) {
    const body = encodeForm(form);
    if (form.method === 'GET') return this.request('GET', `${form.action.split('?')[0]}?${body}`, { signIn: true });
    return this.request('POST', form.action, { body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signIn: true });
  }

  // Returns { status: 'signed-in' } or { status: 'code', sentTo }. Throws McError('credentials').
  async login(email, password, rememberCookie) {
    if (rememberCookie) this.jar.set('TwoFactorRememberBrowser', rememberCookie);
    const page = await this.request('GET', '/Account/Login', { signIn: true });
    const form = readForms(page.text, page.url).find((f) => f.inputs.some((i) => i.type === 'password'));
    if (!form) return this.afterSignIn(page); // already signed in
    const emailInput = form.inputs.find((i) => i.type === 'email' || /email|user/i.test(i.name));
    const passwordInput = form.inputs.find((i) => i.type === 'password');
    setField(form, emailInput?.name || 'Email', email);
    setField(form, passwordInput.name, password);
    return this.afterSignIn(await this.submit(form));
  }

  async afterSignIn(page, codeSent = false) {
    const forms = readForms(page.text, page.url);
    if (forms.some((f) => f.inputs.some((i) => i.type === 'password'))) {
      throw new McError('credentials', pageErrors(page.text)[0] || 'MaidCentral did not accept that email and password.');
    }
    const codeForm = forms.find((f) => f.inputs.some((i) => i.type !== 'hidden' && i.type !== 'checkbox' && CODE_INPUT.test(i.name)));
    if (codeForm) {
      // Some 2FA pages need "Send code" first (a separate form on the same page).
      const sendForm = forms.find((f) => f !== codeForm && /send/i.test(`${f.action} ${f.text}`));
      if (sendForm && !codeSent) return this.afterSignIn(await this.submit(sendForm), true);
      this.pendingForm = codeForm;
      return { status: 'code', sentTo: describeProvider(page.text) };
    }
    // "Choose how to get your code" (ASP.NET Identity SendCode page): prefer email.
    const providerForm = forms.find((f) => f.inputs.some((i) => i.type === 'select' && /provider/i.test(i.name)));
    if (providerForm && !codeSent) {
      const select = providerForm.inputs.find((i) => i.type === 'select' && /provider/i.test(i.name));
      const email = select.options.find((o) => /email/i.test(`${o.value} ${o.label}`));
      if (email) setField(providerForm, select.name, email.value);
      return this.afterSignIn(await this.submit(providerForm), true);
    }
    if (!this.jar.has('.AspNet.ApplicationCookie')) throw new McError('unexpected', 'MaidCentral showed a page we did not expect while signing in.');
    this.signedIn = true;
    return { status: 'signed-in' };
  }

  // Returns { status: 'signed-in', rememberCookie } or throws McError('code').
  async verify(code) {
    if (!this.pendingForm) throw new McError('state', 'No verification code was asked for.');
    const form = this.pendingForm;
    const codeInput = form.inputs.find((i) => i.type !== 'hidden' && i.type !== 'checkbox' && CODE_INPUT.test(i.name));
    setField(form, codeInput.name, String(code).replace(/\s+/g, ''));
    tickCheckbox(form, /remember|trust/i);
    const page = await this.submit(form);
    const again = readForms(page.text, page.url).find((f) => f.inputs.some((i) => i.name === codeInput.name));
    if (again) throw new McError('code', pageErrors(page.text)[0] || 'That code was not accepted. Codes last 5 minutes.');
    this.pendingForm = null;
    const result = await this.afterSignIn(page, true);
    return { ...result, rememberCookie: this.jar.get('TwoFactorRememberBrowser') || null };
  }

  // Read-only calls. Session expiry shows up as a redirect to the login page.
  async getJson(pathname, query = {}) {
    const url = new URL(pathname, this.origin);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    url.searchParams.set('_', String(Date.now()));
    return this.json(await this.request('GET', url.href, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' } }));
  }

  async postFormJson(pathname, fields) {
    const res = await this.request('POST', new URL(pathname, this.origin).href, {
      body: new URLSearchParams(fields).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
    });
    return this.json(res);
  }

  json(res) {
    if (new URL(res.url).pathname.toLowerCase().startsWith('/account/login') || res.status === 401) {
      this.signedIn = false;
      throw new McError('expired', 'Your MaidCentral session has ended. Please sign in again.');
    }
    if (res.status >= 400) throw new McError('upstream', `MaidCentral answered ${res.status}`);
    if (!res.contentType.includes('json')) throw new McError('upstream', 'MaidCentral did not return data');
    return JSON.parse(res.text);
  }
}

// The read-only guarantee, enforced on every call after sign-in.
export function assertRead(method, url, portalHost, headers = {}) {
  const m = method.toUpperCase();
  if (m === 'GET') {
    if (isUnsafeUrl(url)) throw new McError('blocked', `Blocked: ${new URL(url).pathname} looks like an action`);
    return;
  }
  const resourceType = headers['x-requested-with'] ? 'xhr' : 'document';
  if (!isReadPost({ method: m, url, resourceType, portalHost, readPosts: READ_POSTS })) {
    throw new McError('blocked', `Blocked: ${m} ${new URL(url).pathname} is not a reviewed read`);
  }
}

function describeProvider(html) {
  if (/email/i.test(html)) return 'email';
  if (/text|sms|phone/i.test(html)) return 'text message';
  return null;
}

// "/Date(1793609100000)/" -> 1793609100000
export function mcDate(value) {
  const m = /\/Date\((-?\d+)/.exec(String(value ?? ''));
  return m ? Number(m[1]) : null;
}
