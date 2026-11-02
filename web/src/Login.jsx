import { useState } from 'react';
import { api } from './api.js';

export default function Login({ onSignedIn }) {
  const [step, setStep] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'password') {
        const r = await api.login(email, password);
        if (r.status === 'code') {
          setSentTo(r.sentTo);
          setStep('code');
        } else onSignedIn();
      } else {
        await api.code(code);
        onSignedIn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>Clean Bee</h1>
        <p className="muted">Sign in with your MaidCentral account.</p>
        {step === 'password' ? (
          <>
            <label>
              Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <>
            <p>MaidCentral sent a one-time code{sentTo ? ` by ${sentTo}` : ''}. It is valid for 5 minutes.</p>
            <label>
              Verification code
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            </label>
            <p className="muted small">This browser will be remembered for 30 days, like in MaidCentral.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Checking…' : step === 'password' ? 'Sign in' : 'Verify'}</button>
        {step === 'code' && (
          <button type="button" className="link" onClick={() => (setStep('password'), setCode(''), setError(''))}>
            Start again
          </button>
        )}
        <p className="muted small">Your password goes to MaidCentral only; this app never stores it.</p>
      </form>
    </div>
  );
}
