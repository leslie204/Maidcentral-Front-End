import { useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

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
      <form onSubmit={submit} className="login-card">
        <div className="login-brand">
          <div className="brand-mark">CB</div>
          <div>
            <b>Clean Bee</b>
            <span className="muted">Operations</span>
          </div>
        </div>
        {step === 'password' ? (
          <>
            <h1>Sign in</h1>
            <p className="muted">Use your MaidCentral email and password.</p>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <>
            <h1>Check your {sentTo || 'email'}</h1>
            <p className="muted">MaidCentral sent a one-time code. It's valid for 5 minutes.</p>
            <label className="field">
              <span>Verification code</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            </label>
            <p className="muted small">This browser will be remembered for 30 days, like in MaidCentral.</p>
          </>
        )}
        {error && <div className="error-note"><Icon name="alert" size={16} /> {error}</div>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Checking…' : step === 'password' ? 'Continue' : 'Verify'}
        </button>
        {step === 'code' && (
          <button type="button" className="btn ghost block" onClick={() => (setStep('password'), setCode(''), setError(''))}>
            Start again
          </button>
        )}
        <p className="login-foot muted small">
          <Icon name="lock" size={13} /> Your password goes only to MaidCentral. This app never stores it.
        </p>
      </form>
    </div>
  );
}
