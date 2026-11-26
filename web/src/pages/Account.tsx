import { useState } from 'react';
import { api, Icon } from '../lib';
import { ROLE_HELP, ROLE_NAME, type Me } from '../components/sign';

/** Your account: role and password change. Also shown by itself when a password change is required (first sign-in, expiry, reset). */
export default function Account({ me, forced, onDone }: { me: Me; forced?: boolean; onDone?: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) { setMsg({ ok: false, text: 'The two new passwords are different.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api('/account/password', { body: { current: cur, next } });
      setCur(''); setNext(''); setAgain('');
      setMsg({ ok: true, text: 'Password changed. Your other sessions were signed out.' });
      onDone?.();
    } catch (x: any) { setMsg({ ok: false, text: x.message }); }
    finally { setBusy(false); }
  };
  const min = me.policy?.passwordMinLength ?? 12;
  const form = (
    <form className="card stack" onSubmit={submit} style={forced ? undefined : { maxWidth: 520 }}>
      {forced && <div className="brand" style={{ padding: 0 }}><div className="brand-mark"><Icon.bolt size={18} /></div><div className="brand-name">GridLedger<span>Energy cost control</span></div></div>}
      <div>
        <h2 style={{ margin: 0 }}>{forced ? 'Choose a new password' : 'Change password'}</h2>
        <p className="small ink2" style={{ marginTop: 4 }}>{forced
          ? 'Your password is temporary or has expired. Choose your own before you continue.'
          : 'Passwords are personal. Choose one you have not used recently.'}</p>
      </div>
      <div className="field"><label htmlFor="pc">Current password</label><input id="pc" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
      <div className="field"><label htmlFor="pn">New password</label><input id="pn" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <span className="hint">At least {min} characters, with three of: capital letters, small letters, numbers, symbols. Not your user name.</span></div>
      <div className="field"><label htmlFor="pa">New password again</label><input id="pa" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></div>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
      <div className="row"><button className="btn primary" disabled={busy}>Change password</button>
        {forced && <button type="button" className="btn ghost" onClick={async () => { await api('/logout', { method: 'POST' }); location.reload(); }}>Sign out</button>}</div>
    </form>
  );
  if (forced) return <div className="auth">{form}</div>;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Your account</h1><p>Who you are signed in as, what your role allows, and your password.</p></div></div>
      <section className="card" style={{ maxWidth: 520 }}>
        <dl className="kv">
          <dt>Name</dt><dd><b>{me.fullName}</b></dd>
          <dt>User name</dt><dd>{me.username}</dd>
          <dt>Role</dt><dd>{ROLE_NAME[me.role]}: {ROLE_HELP[me.role]}</dd>
          <dt>Times shown in</dt><dd>{me.policy?.zoneLabel}</dd>
        </dl>
      </section>
      {form}
    </div>
  );
}
