// What the crawler may do. It is read-only by default:
//   - after login, every request that isn't GET/HEAD/OPTIONS is blocked and logged
//     ("blocked: write"), whatever started it: XHR, fetch or a form post;
//   - GETs to MaidCentral whose URL names an action (delete, cancel, send, charge…)
//     are blocked too, because some server-rendered apps change data on a GET;
//   - links and buttons that look like they log out, delete, cancel, archive, export,
//     send, charge or touch payroll are never followed or clicked.
// --allow-writes turns the blocking off.

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isWriteMethod(method) {
  return !READ_METHODS.has(String(method).toUpperCase());
}

// Hosts that belong to MaidCentral (the tenant's portal, its API and shared login).
export function isMaidCentralHost(host, portalHost) {
  const h = String(host).toLowerCase();
  return h === String(portalHost).toLowerCase() || /(^|\.)maidcentral\.(com|net)$/.test(h);
}

// Verbs that change something. Used on GET URLs MaidCentral serves.
// (cancel(?!led|lation) keeps "CancelledJobs" lists and "CancellationReasons" lookups;
// delete(?!d) keeps "DeletedClients".)
const ACTION_IN_URL = new RegExp(
  [
    'log_?out', 'log_?off', 'sign_?out',
    'delete(?!d)', 'remove', 'destroy', 'purge',
    'cancel(?!led|lation)', 'archive(?!d)', 'deactivate', 'void', 'refund',
    'charge(?!s\\b)', 'capture_?payment', 'process', 'pay_?roll', 'payout',
    'send', 'resend', 'notify', 'blast',
    'export', 'download(?!s\\b)', 'impersonat', 'login_?as', 'merge',
    'approve', 'finali[sz]e', 'reset', 'import', 'upload', 'sync',
    'clone', 'duplicate', 'unsubscribe',
  ].join('|'),
  'i',
);

const FILE_DOWNLOAD = /\.(csv|pdf|xlsx?|docx?|zip|ics)(\?|$)/i;

export function isUnsafeUrl(url) {
  const u = new URL(url);
  const target = decodeURIComponentSafe(u.pathname + u.search + u.hash);
  return ACTION_IN_URL.test(target) || FILE_DOWNLOAD.test(u.pathname);
}

// Links the crawler won't follow: unsafe URLs, plus whole areas we never browse.
const SKIP_AREA = /pay_?roll|billing\/(card|charge)|merchant|quickbooks|gusto|stripe/i;

export function isSkippedLink(url) {
  const u = new URL(url);
  return isUnsafeUrl(url) || SKIP_AREA.test(decodeURIComponentSafe(u.pathname + u.hash));
}

// Words on a button or link that mean "don't click". Checked against the element's
// visible text and its id/name/class/title/aria-label/href/onclick/data-* attributes.
const UNSAFE_CLICK = new RegExp(
  [
    'log ?out', 'log ?off', 'sign ?out', 'delete', 'remove', 'destroy', 'purge',
    'cancel', 'archive', 'deactivate', 'disable', 'void', 'refund', 'charge', 'pay\\b', 'payroll',
    'payout', 'process', 'send', 'resend', 'email', 'text message', '\\bsms\\b', 'notify', 'invite',
    'export', 'download', 'print', 'impersonat', 'log ?in as', 'merge', 'approve', 'finali[sz]e',
    'reset', 'import', 'upload', 'sync', 'clone', 'duplicate', 'copy', 'save', 'submit', 'confirm',
    'apply', 'complete', 'close ?out', 'lock', 'unsubscribe', 'mark as', 'clock (in|out)',
  ].join('|'),
  'i',
);

export function isUnsafeClick(descriptor) {
  return UNSAFE_CLICK.test(descriptor);
}

// While logging in, the only writes allowed are the sign-in itself: a form post
// (a navigation) or a call whose URL looks like login/2FA. The page the portal lands on
// after login can already fire writes (e.g. "mark as seen"); those are blocked.
const LOGIN_URL = /log_?in|sign_?in|auth|token|account|verif|two_?factor|2fa|mfa|otp|session|captcha/i;

// Part of signing in (recorded without bodies): writes, and anything with a login-ish URL.
export function isLoginRequest(method, url) {
  return isWriteMethod(method) || LOGIN_URL.test(new URL(url).pathname);
}

// Decides what happens to one request the page makes.
export function decideRequest({ method, url, resourceType, phase, allowWrites, portalHost }) {
  if (allowWrites) return { action: 'continue' };
  if (isWriteMethod(method)) {
    if (phase === 'login' && (resourceType === 'document' || LOGIN_URL.test(new URL(url).pathname))) return { action: 'continue' };
    return { action: 'block', reason: 'write' };
  }
  if (phase === 'login') return { action: 'continue' };
  const u = new URL(url);
  if (isMaidCentralHost(u.host, portalHost) && isUnsafeUrl(url)) return { action: 'block', reason: 'unsafe-get' };
  return { action: 'continue' };
}

// Analytics, chat and payment widgets the crawl doesn't need: answered with an empty
// response so pages still load and nothing is reported to those services.
export const STUB_HOSTS =
  /(google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.(net|com)|hotjar|fullstory\.com|intercom(cdn)?\.io|intercom\.com|segment\.(io|com)|mixpanel\.com|hs-scripts\.com|hubspot|zdassets\.com|zendesk|drift\.com|crisp\.chat|tawk\.to|clarity\.ms|sentry\.io|sentry-cdn|nr-data\.net|newrelic\.com|logrocket|pendo\.io|appcues|bugsnag|rollbar|js\.stripe\.com|m\.stripe\.network|smartlook|mouseflow|heap(analytics)?\.|userway|olark|livechatinc|tidio|freshchat|gist\.build|beamer)/i;

// Login detection. A verification-code box after login means 2FA: a person supplies the
// code, in the browser window (--headed) or through the code file (headless).
export const PASSWORD_INPUT = 'input[type="password"]';
export const TWO_FACTOR_INPUT =
  'input[autocomplete="one-time-code"], input[name*="code" i]:not([type="hidden"]), input[id*="code" i]:not([type="hidden"]), input[name*="otp" i], input[name*="2fa" i], input[name*="mfa" i], input[name*="verif" i]:not([type="hidden"])';

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
