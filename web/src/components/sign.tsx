import { createContext, useContext, useRef, useState } from 'react';
import { ApiError, type ChangeAuth, Icon } from '../lib';

export type Me = {
  id: number; username: string; fullName: string; role: 'admin' | 'qa' | 'engineer' | 'operator' | 'viewer';
  mustChangePassword: boolean; signedOnce: boolean; perms: string[];
  policy?: { part11Mode: boolean; signConfigChanges: boolean; signAlarmActions: boolean; idleTimeoutMin: number; passwordMinLength: number; zoneLabel: string };
};

export const ROLE_NAME: Record<string, string> = { admin: 'Admin', qa: 'Quality (QA)', engineer: 'Engineer', operator: 'Operator', viewer: 'Viewer' };
export const ROLE_HELP: Record<string, string> = {
  viewer: 'Sees everything, exports data. Cannot change anything.',
  operator: 'Viewer + acknowledges and closes alarms, decides on savings suggestions.',
  engineer: 'Operator + meters, plant, tariff, bills, notifications; reviews reports.',
  qa: 'Sees the audit trail, checks integrity, reviews and approves reports. Cannot change settings.',
  admin: 'Everything, including users and the compliance (21 CFR Part 11) settings.',
};

type Ctx = {
  me: Me;
  can: (perm: string) => boolean;
  /** Runs a change; if the Engine asks for a reason or an e-signature (HTTP 428), shows the dialog and retries. */
  signed: <T>(run: (c?: ChangeAuth) => Promise<T>) => Promise<T>;
};
const C = createContext<Ctx | null>(null);
export const useMe = () => useContext(C)!;
export const isCancel = (e: any) => e instanceof ApiError && e.status === 0;

type Pending = {
  meaning: string; reasonRequired: boolean; signatureRequired: boolean; error?: string;
  run: (c?: ChangeAuth) => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void;
};

export function SignProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const [p, setP] = useState<Pending | null>(null);
  const signedOnce = useRef(me.signedOnce);
  const can = (perm: string) => me.perms?.includes(perm) ?? false;
  const signed = async <T,>(run: (c?: ChangeAuth) => Promise<T>): Promise<T> => {
    try { return await run(undefined); }
    catch (e: any) {
      if (!(e instanceof ApiError) || e.status !== 428) throw e;
      return new Promise<T>((resolve, reject) => setP({
        meaning: e.data?.meaning ?? 'Change', reasonRequired: !!e.data?.reasonRequired, signatureRequired: !!e.data?.signatureRequired, run, resolve, reject,
      }));
    }
  };
  return (
    <C.Provider value={{ me, can, signed }}>
      {children}
      {p && <SignDialog p={p} me={me} firstSignature={!signedOnce.current}
        onDone={(v, usedSignature) => { if (usedSignature) signedOnce.current = true; p.resolve(v); setP(null); }}
        onError={(msg, data) => setP({ ...p, error: msg, ...(data ? { reasonRequired: !!data.reasonRequired, signatureRequired: !!data.signatureRequired } : {}) })}
        onCancel={() => { p.reject(new ApiError(0, 'Cancelled')); setP(null); }} />}
    </C.Provider>
  );
}

function SignDialog({ p, me, firstSignature, onDone, onError, onCancel }: {
  p: Pending; me: Me; firstSignature: boolean; onDone: (v: any, usedSig: boolean) => void; onError: (m: string, data?: any) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const v = await p.run({ reason: reason || undefined, password: p.signatureRequired ? password : undefined, username: p.signatureRequired && firstSignature ? username : undefined });
      onDone(v, p.signatureRequired);
    } catch (x: any) {
      setPassword('');
      if (x instanceof ApiError && x.status === 428) onError(x.message, x.data);
      else onError(x.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="sign-title">
      <form className="modal card stack" onSubmit={submit}>
        <div className="row" style={{ gap: 10 }}>
          <div className="brand-mark" style={{ background: 'var(--charcoal)' }}>{p.signatureRequired ? <Icon.pen size={17} /> : <Icon.shield size={17} />}</div>
          <div>
            <h2 id="sign-title" style={{ margin: 0 }}>{p.signatureRequired ? 'Electronic signature' : 'Reason for change'}</h2>
            <div className="small ink2">Meaning: <b>{p.meaning}</b></div>
          </div>
        </div>
        {p.reasonRequired && (
          <div className="field">
            <label htmlFor="sg-r">Reason</label>
            <textarea id="sg-r" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} autoFocus
              placeholder="Why is this being done? It is saved with the change in the audit trail." />
          </div>
        )}
        {p.signatureRequired && <>
          <div className="note-box small">
            Signing as <b>{me.fullName || me.username}</b> ({me.username}). Your electronic signature is the legally binding equivalent of your
            handwritten signature. It records your name, the date and time and the meaning above, and is linked to exactly this content.
          </div>
          {firstSignature && (
            <div className="field"><label htmlFor="sg-u">User name</label>
              <input id="sg-u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus={!p.reasonRequired} />
              <span className="hint">The first signature in a session needs your user name and password; later ones only the password.</span>
            </div>
          )}
          <div className="field"><label htmlFor="sg-p">Password</label>
            <input id="sg-p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoFocus={!p.reasonRequired && !firstSignature} />
          </div>
        </>}
        {p.error && <div className="error-box">{p.error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={busy}>{p.signatureRequired ? <><Icon.pen size={15} />Sign</> : 'Confirm'}</button>
        </div>
      </form>
    </div>
  );
}
