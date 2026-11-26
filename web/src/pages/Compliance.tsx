import { Fragment, useState } from 'react';
import { api, fmt, Icon, Loading, useApi } from '../lib';
import { Empty, Stat } from '../components/common';
import { useMe } from '../components/sign';

const ACTIONS: Record<string, string> = {
  LOGIN: 'Signed in', LOGOUT: 'Signed out', LOGIN_FAILED: 'Sign-in failed', LOGIN_REFUSED: 'Sign-in refused', ACCOUNT_LOCKED: 'Account locked',
  PASSWORD_CHANGED: 'Password changed', PASSWORD_CHANGE_FAILED: 'Password change failed', PASSWORD_RESET: 'Password reset by admin',
  E_SIGNATURE: 'Electronic signature', SIGNATURE_FAILED: 'Signature refused (wrong password)',
  SETTINGS_CHANGED: 'Settings changed', METER_ADDED: 'Meter added', METER_CHANGED: 'Meter changed', METER_REMOVED: 'Meter removed',
  BILL_ENTERED: 'Bill entered', BILL_CHANGED: 'Bill changed', BILL_DELETED: 'Bill deleted',
  USER_CREATED: 'User created', USER_CHANGED: 'User changed', USER_DEACTIVATED: 'User deactivated', USER_UNLOCKED: 'User unlocked',
  ALARM_ACKNOWLEDGE: 'Alarm acknowledged', ALARM_RESOLVE: 'Alarm closed', ALARM_DONE: 'Reminder done', ALARM_DISMISS: 'Reminder skipped',
  ADVICE_ACCEPT: 'Suggestion accepted', ADVICE_DISMISS: 'Suggestion declined', ADVICE_DONE: 'Suggestion done',
  EXPORT: 'Data exported', INTEGRITY_CHECK: 'Integrity check', DATA_SEALED: 'Day of data sealed', RAW_DATA_ARCHIVED: 'Raw readings archived', RAW_DATA_REMOVED: 'Raw readings removed',
};

const MATRIX: [string, string, string][] = [
  ['11.10(a)', 'Validation; detect invalid or altered records', 'Validation pack (requirements, risk assessment, test scripts) in the source docs folder. Audit trail chained with SHA-256; 15-minute data sealed daily; "Check integrity" finds any change.'],
  ['11.10(b)', 'Accurate and complete copies', 'Reports (print / PDF) with data checksum and signatures; CSV exports with SHA-256 checksum, logged in the audit trail.'],
  ['11.10(c)', 'Protection and retrieval during retention', 'Database refuses changes to old measured data, the audit trail and signatures. Raw readings are archived to checksummed files before removal; nothing else is ever removed.'],
  ['11.10(d)', 'Access limited to authorised people', 'Personal accounts only, five roles, idle sign-out, session limit, encrypted (HTTPS) access for other PCs.'],
  ['11.10(e)', 'Secure, time-stamped audit trail', 'Every sign-in, change, signature and export: who, when (UTC and plant time), what, old value, new value, reason. Cannot be edited or deleted.'],
  ['11.10(f)', 'Operational sequence checks', 'Alarms must be acknowledged before they can be closed; reports must be reviewed before approval, by a different person.'],
  ['11.10(g)', 'Authority checks', 'Each action checks the role (viewer, operator, engineer, QA, admin). Only admins change users and compliance settings.'],
  ['11.10(h)', 'Device checks', 'Data guard on every reading (range, frozen values, counters); meter offline alarms; template per meter model.'],
  ['11.10(i)', 'Training of users', 'Site procedure (not software). Keep training records for each person given an account.'],
  ['11.10(j)', 'Written policy on signature accountability', 'Site procedure. The signature dialog states that the signature is legally binding.'],
  ['11.10(k)', 'Control of system documentation', 'Versioned source and documents in Git; version shown in the Dashboard.'],
  ['11.30', 'Open systems', 'HTTPS between PCs and the Dashboard; gateway key between Dashboard and Engine.'],
  ['11.50', 'Signature manifestation', 'Printed name, user name, date and time with zone, and meaning on every signed record and report.'],
  ['11.70', 'Signature linked to record', 'Each signature stores the SHA-256 of the signed content; reports show "changed after signing" if the data differs.'],
  ['11.100', 'Unique signatures; identity; FDA certification', 'User names are never reused or shared. Identity check before giving an account, and the letter to FDA, are site tasks.'],
  ['11.200', 'Two-part signatures', 'User name + password for the first signature in a session, password for later ones.'],
  ['11.300', 'Password controls', 'Minimum length and character mix, expiry, history, lockout after repeated wrong passwords with a security alert; admin unlock and temporary passwords.'],
];

export default function Compliance() {
  const { me } = useMe();
  const st = useApi<any>('/compliance/status', 30000);
  const [f, setF] = useState({ from: '', to: '', who: '', recordType: '', q: '', seals: '' });
  const qs = new URLSearchParams(Object.entries({ ...f, limit: '300' }).filter(([, v]) => v)).toString();
  const audit = useApi<any>(`/audit?${qs}`, 30000);
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const runCheck = async () => {
    setBusy(true);
    try { setCheck(await api('/audit/verify', { body: {} })); st.reload(); audit.reload(); } catch (e: any) { setCheck({ ok: false, message: e.message, sealProblems: [] }); }
    finally { setBusy(false); }
  };
  const s = st.data;
  const zone = audit.data?.zoneLabel ?? me.policy?.zoneLabel ?? '';
  const t = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Audit trail and compliance</h1>
          <p>The secure record of who did what and when, electronic signatures, data seals and archives (21 CFR Part 11). Nothing here can be edited or deleted. Times are {zone}.</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={runCheck} disabled={busy}><Icon.shield size={16} />{busy ? 'Checking…' : 'Check integrity now'}</button>
          <a className="btn" href="/api/audit/export.csv">Export audit trail (CSV)</a>
        </div>
      </div>
      {check && (
        <div className={check.ok ? 'ok-box' : 'error-box'}>
          <b>{check.ok ? 'Integrity confirmed. ' : 'Integrity problem found. '}</b>{check.message}
          {check.sealedDays != null && <> {check.sealedDays} sealed days of 15-minute data checked{check.sealProblems?.length ? ':' : ', all match.'}</>}
          {check.sealProblems?.length > 0 && <ul style={{ margin: '6px 0 0 18px' }}>{check.sealProblems.map((p: string) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}
      {!s ? <Loading error={st.error} /> : (
        <div className="grid g4">
          <Stat label="Part 11 controls" value={s.policy.part11Mode ? 'On' : 'Off'} sub={`Signatures for changes: ${s.policy.signConfigChanges ? 'on' : 'off'}; alarms: ${s.policy.signAlarmActions ? 'on' : 'off'}`} />
          <Stat label="Audit trail" value={fmt.n0(s.auditEntries)} sub={`${fmt.n0(s.signatures)} electronic signatures`} />
          <Stat label="Sealed days of data" value={fmt.n0(s.sealedDays)} sub={s.lastSeal ? `Up to ${fmt.date(s.lastSeal.slice(0, 10))}` : 'First seal after 2 days of data'} />
          <Stat label="Accounts" value={`${s.users.active} active`} sub={`${s.users.locked} locked; ${s.users.passwordDue} password${s.users.passwordDue === 1 ? '' : 's'} expired`} />
        </div>
      )}
      {s?.lastCheck && !check && (
        <div className="note-box">Last integrity check: {t(s.lastCheck.ts)} by {s.lastCheck.fullName || s.lastCheck.username}: {JSON.parse(s.lastCheck.newValue ?? '{}').ok ? 'all intact' : 'problem found'}.</div>
      )}

      <section className="card">
        <div className="card-head"><h2>Audit trail</h2><p>Newest first. Select a row to see the full old and new values and its checksum.</p></div>
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" style={{ width: 150 }} />
          <input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" style={{ width: 150 }} />
          <input className="input" placeholder="User name" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value.trim().toLowerCase() })} style={{ width: 140 }} />
          <select className="input" value={f.recordType} onChange={(e) => setF({ ...f, recordType: e.target.value })} style={{ width: 160 }} aria-label="Record type">
            <option value="">All records</option><option value="settings">Settings</option><option value="meter">Meters</option><option value="bill">Bills</option>
            <option value="user">Users and sign-ins</option><option value="insight">Alarms and suggestions</option><option value="report">Reports</option>
            <option value="data">Data exports</option><option value="day">Data seals</option><option value="readings">Archives</option><option value="audit_trail">Audit trail</option>
          </select>
          <input className="input" placeholder="Search action, reason, value" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ width: 220 }} />
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={f.seals === '1'} onChange={(e) => setF({ ...f, seals: e.target.checked ? '1' : '' })} />Show daily data seals</label>
        </div>
        {!audit.data ? <Loading error={audit.error} /> : audit.data.entries.length === 0 ? <Empty title="No entries match" /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th className="r">#</th><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Reason</th><th>Change</th></tr></thead>
              <tbody>{audit.data.entries.map((e: any) => (
                <Fragment key={e.seq}>
                  <tr className="click" onClick={() => setOpen(open === e.seq ? null : e.seq)}>
                    <td className="r tiny muted">{e.seq}</td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{t(e.ts)}</td>
                    <td className="small"><b>{e.fullName || e.username}</b>{e.fullName && <div className="tiny muted">{e.username}</div>}</td>
                    <td className="small">{ACTIONS[e.action] ?? e.action}</td>
                    <td className="small">{e.recordType}{e.recordId ? ` ${e.recordId}` : ''}</td>
                    <td className="small">{e.reason ?? ''}</td>
                    <td className="small"><Change oldV={e.oldValue} newV={e.newValue} short /></td>
                  </tr>
                  {open === e.seq && (
                    <tr><td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                      <div className="grid g2">
                        <div><div className="tiny muted">Old value</div><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{pretty(e.oldValue)}</pre></div>
                        <div><div className="tiny muted">New value</div><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{pretty(e.newValue)}</pre></div>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 8 }}>UTC {e.ts} · from {e.clientIp ?? 'the Engine'}</div>
                      <div className="mono muted">hash {e.hash}<br />previous {e.prevHash}</div>
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {s?.archives?.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Archived raw readings</h2><p>5-second readings moved out of the database after {s.policy.rawReadingsKeepDays} days, in the Engine's data\archive folder</p></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Day</th><th>File</th><th className="r">Readings</th><th>SHA-256</th></tr></thead>
            <tbody>{s.archives.map((a: any) => <tr key={a.day}><td>{fmt.date(a.day)}</td><td className="small">{a.file}</td><td className="r">{fmt.n0(a.rows)}</td><td className="mono">{a.sha256}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>How GridLedger meets 21 CFR Part 11</h2><p>Software controls, and what remains a site procedure</p></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Section</th><th>Requirement</th><th>In GridLedger</th></tr></thead>
            <tbody>{MATRIX.map(([sec, req, how]) => <tr key={sec}><td className="small"><b>§{sec}</b></td><td className="small">{req}</td><td className="small">{how}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function pretty(v?: string | null) {
  if (v == null) return '–';
  try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
}

/** Old → new, compactly: changed keys of a settings diff or a few fields of a record. */
function Change({ oldV, newV, short }: { oldV?: string | null; newV?: string | null; short?: boolean }) {
  let o: any = null, n: any = null;
  try { o = oldV ? JSON.parse(oldV) : null; } catch { o = oldV; }
  try { n = newV ? JSON.parse(newV) : null; } catch { n = newV; }
  if (o == null && n == null) return null;
  const isObj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
  const keys = [...new Set([...(isObj(o) ? Object.keys(o) : []), ...(isObj(n) ? Object.keys(n) : [])])];
  if (!keys.length) return <span className="diff">{String(n ?? o)}</span>;
  const shown = short ? keys.slice(0, 3) : keys;
  const v = (x: any) => (x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));
  return (
    <div className="diff">
      {shown.map((k) => (
        <div key={k}><span className="muted">{k}</span>{isObj(o) && k in o && <> <span className="old">{v(o[k]).slice(0, 40)}</span></>}{isObj(n) && k in n && <> → <span className="new">{v(n[k]).slice(0, 60)}</span></>}</div>
      ))}
      {short && keys.length > 3 && <div className="muted">+{keys.length - 3} more</div>}
    </div>
  );
}
