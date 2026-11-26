import { useEffect, useState } from 'react';
import { api, fmt, Loading, SevChip, useApi } from '../lib';
import { Empty, type InsightT } from '../components/common';
import { isCancel, useMe } from '../components/sign';
import { STATUS } from './Alerts';

const ORDER: Record<string, number> = { critical: 0, serious: 1, watch: 2, info: 3 };

/** Alert → action needed → action taken. Every step is signed and kept in the audit trail. */
function Flow({ i, onDone, readOnly }: { i: InsightT; onDone: () => void; readOnly?: boolean }) {
  const { can, signed, me } = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const part11 = me.policy?.part11Mode ?? false;
  const act = async (a: string) => {
    setBusy(true); setErr(null);
    try { await signed((c) => api(`/insights/${i.id}/${a}`, { body: { note: c?.reason ?? null }, change: c })); onDone(); }
    catch (e: any) { if (!isCancel(e)) setErr(e.message); }
    finally { setBusy(false); }
  };
  const [cls, word] = STATUS[i.status] ?? ['s-neutral', i.status];
  return (
    <div className="flow" id={`a${i.id}`}>
      <div>
        <div className="step"><i>1</i>Alert</div>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}><SevChip sev={i.severity} /><span className="tiny muted">{fmt.dateTime(i.openedAt)}</span></div>
        <h3>{i.title}</h3>
        <p>{i.what}</p>
      </div>
      <div>
        <div className="step"><i>2</i>Action needed</div>
        <h3>{i.action}</h3>
        <p className="small">{i.why}</p>
      </div>
      <div>
        <div className="step"><i>3</i>Action taken</div>
        <div style={{ marginBottom: 8 }}><span className={`chip ${cls}`}>{word}</span></div>
        {i.handledBy ? <p className="small"><b>{i.handledBy}</b> · {fmt.dateTime(i.updatedAt)}{i.handledNote ? <><br />“{i.handledNote}”</> : null}</p> : <p className="small muted">Nobody has acted yet.</p>}
        {!readOnly && can('alarm') && (
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            {i.status === 'open' && <button className="btn primary sm" disabled={busy} onClick={() => act('acknowledge')}>Acknowledge</button>}
            {(i.status === 'acknowledged' || !part11) && <button className="btn sm" disabled={busy} onClick={() => act('resolve')}>Close (fixed)</button>}
          </div>
        )}
        {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  );
}

export default function Actions() {
  const [view, setView] = useState<'active' | 'history'>('active');
  const q = useApi<InsightT[]>(`/insights?kind=alert&view=${view}`, 15000);
  const list = [...(q.data ?? [])].sort((a, b) => view === 'active' ? (ORDER[a.severity] - ORDER[b.severity]) || b.openedAt.localeCompare(a.openedAt) : b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && q.data) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [q.data]);
  const needed = (q.data ?? []).filter((i) => i.status === 'open').length;
  const handling = (q.data ?? []).filter((i) => i.status === 'acknowledged').length;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Actions</h1>
        <div className="seg">
          <button className={view === 'active' ? 'on' : ''} onClick={() => setView('active')}>To do</button>
          <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>Done</button>
        </div>
      </div>
      {view === 'active' && (
        <div className="grid g3">
          <div className="card stat"><div className="label">Action needed</div><div className="value num">{needed}</div></div>
          <div className="card stat"><div className="label">Being handled</div><div className="value num">{handling}</div></div>
          <div className="card stat"><div className="label">Every step</div><div className="value" style={{ fontSize: 20 }}>Signed and kept in the audit trail</div></div>
        </div>
      )}
      <section className="card">
        {!q.data ? <Loading error={q.error} /> : list.length === 0 ? <Empty title={view === 'active' ? 'Nothing to do' : 'No finished actions yet'} /> :
          list.map((i) => <Flow key={i.id} i={i} onDone={q.reload} readOnly={view === 'history'} />)}
      </section>
    </div>
  );
}
