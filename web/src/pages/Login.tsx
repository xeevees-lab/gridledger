import { useState } from 'react';
import { api, Icon } from '../lib';

export default function Login({ setup, notice, onLogin }: { setup: boolean; notice?: string | null; onLogin: () => void }) {
  const [username, setU] = useState('');
  const [fullName, setF] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api(setup ? '/setup' : '/login', { body: setup ? { username, fullName, password } : { username, password } }); onLogin(); }
    catch (x: any) { setErr(x.status === 429 ? 'Too many tries from this computer. Wait 5 minutes and try again.' : x.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><Icon.bolt size={18} /></div>
          <div className="brand-name">GridLedger<span>Energy cost control</span></div>
        </div>
        <div>
          <h1 style={{ fontSize: 20 }}>{setup ? 'Create the admin account' : 'Sign in'}</h1>
          <p className="ink2 small" style={{ marginTop: 4 }}>
            {setup ? 'This is the first start. The admin adds meters, changes tariffs and creates an account for every other person.' : 'Use your own account. Accounts are personal: never share your password.'}
          </p>
        </div>
        {notice && <div className="note-box">{notice}</div>}
        <div className="field"><label htmlFor="u">User name</label><input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required /></div>
        {setup && <div className="field"><label htmlFor="f">Full name</label><input id="f" className="input" autoComplete="name" value={fullName} onChange={(e) => setF(e.target.value)} required minLength={3} />
          <span className="hint">Printed with your electronic signatures.</span></div>}
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setP(e.target.value)} required />
          {setup && <span className="hint">At least 12 characters, with three of: capital letters, small letters, numbers, symbols.</span>}
        </div>
        {err && <div className="error-box">{err}</div>}
        <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{setup ? 'Create account and sign in' : 'Sign in'}</button>
      </form>
    </div>
  );
}
