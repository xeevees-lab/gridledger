import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt, Loading, SevChip, useApi } from '../lib';
import { Empty, type InsightT } from '../components/common';

const ORDER: Record<string, number> = { critical: 0, serious: 1, watch: 2, info: 3 };
export const STATUS: Record<string, [string, string]> = {
  open: ['s-serious', 'Action needed'], acknowledged: ['s-info', 'Being handled'], accepted: ['s-info', 'Being handled'],
  resolved: ['s-good', 'Closed'], done: ['s-good', 'Done'], dismissed: ['s-neutral', 'Dismissed'],
};

export default function Alerts() {
  const [view, setView] = useState<'active' | 'history'>('active');
  const q = useApi<InsightT[]>(`/insights?kind=alert&view=${view}`, 10000);
  const list = [...(q.data ?? [])].sort((a, b) => view === 'active' ? (ORDER[a.severity] - ORDER[b.severity]) || b.openedAt.localeCompare(a.openedAt) : b.updatedAt.localeCompare(a.updatedAt));
  const counts = (q.data ?? []).reduce((m: Record<string, number>, i) => { m[i.severity] = (m[i.severity] ?? 0) + 1; return m; }, {});
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Alerts</h1>
        <div className="seg">
          <button className={view === 'active' ? 'on' : ''} onClick={() => setView('active')}>Open</button>
          <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>History</button>
        </div>
      </div>
      {view === 'active' && (
        <div className="grid g4">
          {(['critical', 'serious', 'watch', 'info'] as const).map((s) => (
            <div className="card stat" key={s}><div className="label"><SevChip sev={s} /></div><div className="value num">{counts[s] ?? 0}</div></div>
          ))}
        </div>
      )}
      <section className="card">
        {!q.data ? <Loading error={q.error} /> : list.length === 0 ? (
          <Empty title={view === 'active' ? 'All clear' : 'No closed alerts yet'}>{view === 'active' ? 'No open alerts.' : ''}</Empty>
        ) : (
          <div className="alert-rows">
            {list.map((i) => {
              const [cls, word] = STATUS[i.status] ?? ['s-neutral', i.status];
              return (
                <div key={i.id} className={`alert-row sev-${i.severity}`}>
                  <span className="bar" />
                  <div><div className="t">{i.title}</div><div className="m">{i.what}</div></div>
                  <div><SevChip sev={i.severity} /></div>
                  <div className="small"><div>{fmt.dateTime(i.openedAt)}</div><div className="tiny muted">{i.handledBy ? `by ${i.handledBy}` : 'opened'}</div></div>
                  <div style={{ textAlign: 'right' }}>
                    {view === 'active' ? <Link className="btn sm" to={`/actions#a${i.id}`}>{word} →</Link> : <span className={`chip ${cls}`}>{word}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
