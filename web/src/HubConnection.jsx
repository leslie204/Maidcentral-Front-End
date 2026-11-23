import { useEffect, useState } from 'react';
import { api } from './api.js';
import { PageHeader, Card, ErrorNote, Skeleton, Help } from './ui.jsx';

// Sales Hub connection: the Hub's own MaidCentral user, which the Sales Hub reads MaidCentral
// as when a rep finds a time for a Clean Bee lead. Its password is used once to sign in and
// never stored; MaidCentral's code is asked for the first time on this server.
const STATE = {
  signed_in: { label: 'Connected', tone: 'ok' },
  code: { label: 'Waiting for MaidCentral’s code', tone: 'warn' },
  signed_out: { label: 'Signed out', tone: 'bad' },
};
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);

export default function HubConnection() {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(null);

  const load = () => api.hubConnection().then(setS, setError);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const run = (fn) => async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setS(next);
      if (next.sentTo) setSentTo(next.sentTo);
      setPassword('');
      setCode('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!s) return (<><PageHeader title="Sales Hub connection" /><ErrorNote error={error} />{!error && <Skeleton rows={3} />}</>);
  const st = STATE[s.state] || STATE.signed_out;
  const on = s.callers?.length > 0;

  return (
    <>
      <PageHeader
        title="Sales Hub connection"
        subtitle="Reps in the Sales Hub find and hold times for Clean Bee leads with this app’s openings. The Hub reads MaidCentral as its own user, set up here."
      />
      <ErrorNote error={error} />
      <div className="hub-grid">
        <Card title="The Hub’s MaidCentral user" actions={<span className={`pill ${st.tone}`}>{st.label}</span>}>
          {s.state === 'signed_in' ? (
            <div className="hub-rows">
              <p><b>{s.email}</b> is signed in{s.since ? ` since ${when(s.since)}` : ''}.{s.lastUsed ? ` Last used by the Hub ${when(s.lastUsed)}.` : ''}</p>
              <p className="muted">It stays signed in: this app uses it every 10 minutes so MaidCentral doesn’t end the session. {s.signsInByItself ? 'If MaidCentral signs it out, it signs back in by itself.' : 'If MaidCentral signs it out, the Hub shows “signed out” and someone signs it in here again.'}</p>
              <div><button className="btn sm" disabled={busy} onClick={run(() => api.hubSignOut())}>Sign it out</button></div>
            </div>
          ) : s.state === 'code' ? (
            <form className="hub-rows" onSubmit={run(() => api.hubCode(code))}>
              <p>MaidCentral sent a code{sentTo ? ` to ${sentTo}` : ' to the Hub user'}. Enter it to finish. This browser is remembered for 30 days, so it isn’t asked for again soon.</p>
              <label className="field">
                <span>Code</span>
                <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
              </label>
              <div className="row-gap">
                <button className="btn primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Finish signing in'}</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={run(() => api.hubSignOut())}>Start again</button>
              </div>
            </form>
          ) : (
            <form className="hub-rows" onSubmit={run(() => api.hubSignIn(email, password))}>
              {s.error && <p className="muted">Last problem: {s.error}</p>}
              <p>
                Sign in the MaidCentral user made for the Sales Hub (not your own login).
                <Help wide>Create it in MaidCentral as its own user with access to the schedule, so the Hub sees exactly what that user can see. The password is used once to sign in and is never stored.</Help>
              </p>
              <label className="field">
                <span>Hub user’s email</span>
                <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <div><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in the Hub user'}</button></div>
            </form>
          )}
        </Card>

        <Card title="Who may connect" actions={<span className={`pill ${on ? 'ok' : 'warn'}`}>{on ? 'On' : 'Off'}</span>}>
          {on ? (
            <div className="hub-rows">
              <p>Open to: <b>{s.callers.join(', ')}</b> (brand <b>{s.brand}</b>).</p>
              <p className="muted">Each caller has its own token; this app keeps only its fingerprint (<code>PLACEMENT_TOKENS</code>).</p>
            </div>
          ) : (
            <div className="hub-rows">
              <p>No caller is set up, so the Sales Hub can’t connect yet.</p>
              <ol className="muted">
                <li>On your computer, in this repository: <code>npm run placement-token -- sales-hub</code></li>
                <li>Put the token in the Sales Hub’s <code>PLACEMENT_TOKEN_CLEANBEE</code>, and this app’s address in its <code>PLACEMENT_URL_CLEANBEE</code>.</li>
                <li>Put the entry (<code>sales-hub:sha256:…</code>, not a secret) in this app’s <code>PLACEMENT_TOKENS</code>.</li>
              </ol>
            </div>
          )}
          {s.badTokens?.length ? <p className="error-note">Ignored in PLACEMENT_TOKENS: {s.badTokens.join(', ')}.</p> : null}
        </Card>
      </div>
    </>
  );
}
