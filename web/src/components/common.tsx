import { useState } from 'react';
import { api, fmt, SevChip, zoneColor } from '../lib';
import { isCancel, useMe } from './sign';

export type Zone = { code: string; label: string; from: string; to: string; rate: number; unitCost: number };

const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** The 24-hour time-of-day strip: which price zone you are in now and what a unit costs. */
export function DayRibbon({ zones, minuteOfDay }: { zones: Zone[]; minuteOfDay: number }) {
  const segs = [...zones].sort((a, b) => toMin(a.from) - toMin(b.from));
  const now = segs.find((z) => minuteOfDay >= toMin(z.from) && minuteOfDay < toMin(z.to)) ?? segs[0];
  return (
    <div className="ribbon" role="img" aria-label={`Now in zone ${now.code}, ${now.label}, ₹${now.unitCost} per unit`}>
      <div className="ribbon-track">
        {segs.map((z) => {
          const w = ((toMin(z.to) - toMin(z.from)) / 1440) * 100;
          return (
            <div key={z.code} className="ribbon-seg" style={{ width: `${w}%`, background: zoneColor(z.code), color: `var(--zone-${z.code}-ink, #fff)` }} title={`${z.label} ${z.from}–${z.to}`}>
              <b>{z.code}  {z.label}</b>
              <span>₹{z.unitCost.toFixed(2)}/unit{z.rate !== 0 ? ` (${z.rate > 0 ? '+' : '−'}₹${Math.abs(z.rate)})` : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="ribbon-now" style={{ left: `${(minuteOfDay / 1440) * 100}%` }} data-label={`Now ${fmt.hhmm(minuteOfDay)}`} />
      <div className="ribbon-hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={`value num ${tone ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export type InsightT = {
  id: number; kind: 'alert' | 'advice'; code: string; severity: string; title: string; what: string; why: string; action: string;
  savingInrYear?: number | null; confidence?: string | null; status: string; openedAt: string; updatedAt: string; handledBy?: string; handledNote?: string;
};

const CONF: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Early estimate' };

/** One alert or suggestion, with what happened, why, what to do, and the buttons that close the loop. */
export function InsightCard({ i, onDone, readOnly }: { i: InsightT; onDone?: () => void; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { can, signed, me } = useMe();
  const part11 = me.policy?.part11Mode ?? false;
  const act = async (a: string) => {
    setBusy(true); setErr(null);
    try { await signed((c) => api(`/insights/${i.id}/${a}`, { body: { note: c?.reason ?? null }, change: c })); onDone?.(); }
    catch (e: any) { if (!isCancel(e)) setErr(e.message); }
    finally { setBusy(false); }
  };
  const isAdvice = i.kind === 'advice';
  const isPlan = i.code.startsWith('PLAN_');
  const allowed = isAdvice ? can('advice') : can('alarm');
  const active = ['open', 'acknowledged', 'accepted'].includes(i.status);
  return (
    <article className={`insight sev-${i.severity}`}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <SevChip sev={i.severity} />
          {i.status === 'acknowledged' && <span className="chip s-neutral">Acknowledged by {i.handledBy}</span>}
          {i.status === 'accepted' && <span className="chip s-good">Accepted, being tracked</span>}
          {!active && <span className="chip s-neutral">{statusWord(i.status)}{i.handledBy ? ` by ${i.handledBy}` : ''}</span>}
          {i.confidence && <span className="chip s-neutral">{CONF[i.confidence] ?? i.confidence}</span>}
          <span className="tiny muted">{fmt.dateTime(i.openedAt)}</span>
        </div>
        <h3>{i.title}</h3>
      </div>
      {i.savingInrYear ? <div className="money num">{fmt.inrShort(i.savingInrYear)}<small>saving per year</small></div> : <div />}
      <dl>
        <dt>What</dt><dd>{i.what}</dd>
        <dt>Why</dt><dd>{i.why}</dd>
        <dt>What to do</dt><dd><b>{i.action}</b></dd>
        {i.handledNote && <><dt>{active ? 'Note' : 'Result'}</dt><dd>{i.handledNote}</dd></>}
      </dl>
      {!readOnly && active && allowed && (
        <div className="actions">
          {isAdvice && i.status === 'open' && <button className="btn primary sm" disabled={busy} onClick={() => act('accept')}>Accept</button>}
          {isAdvice && i.status === 'open' && <button className="btn sm" disabled={busy} onClick={() => act('dismiss')}>Not now</button>}
          {isAdvice && i.status === 'accepted' && <button className="btn sm" disabled={busy} onClick={() => act('done')}>Mark as done</button>}
          {!isAdvice && !isPlan && i.status === 'open' && <button className="btn primary sm" disabled={busy} onClick={() => act('acknowledge')}>Acknowledge</button>}
          {!isAdvice && !isPlan && (i.status === 'acknowledged' || !part11) && <button className="btn sm" disabled={busy} onClick={() => act('resolve')}>Close (fixed)</button>}
          {!isAdvice && isPlan && <button className="btn sm" disabled={busy} onClick={() => act('done')}>Done</button>}
          {!isAdvice && isPlan && <button className="btn ghost sm" disabled={busy} onClick={() => act('dismiss')}>Skip today</button>}
          {!isAdvice && !isPlan && i.status === 'open' && part11 && <span className="tiny muted">Acknowledge first, then close when it is fixed.</span>}
        </div>
      )}
      {err && <div className="error-box" style={{ gridColumn: '1 / -1' }}>{err}</div>}
    </article>
  );
}

function statusWord(s: string) {
  return ({ resolved: 'Resolved', dismissed: 'Not now', done: 'Done' } as Record<string, string>)[s] ?? s;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

/** A horizontal bar: this month's MD against the free floor and contract demand. */
export function MdBar({ md, floor, cd, projected }: { md?: number | null; floor: number; cd: number; projected?: number | null }) {
  const max = cd * 1.15;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="mdbar" aria-label={`Maximum demand ${md ?? 0} kVA; minimum billed ${floor} kVA; contract ${cd} kVA`}>
      <div className="fill" style={{ width: pct(md ?? 0) }} />
      <div className="mark" style={{ left: pct(floor) }}><span>Min. billed {fmt.n0(floor)}</span></div>
      <div className="mark cd" style={{ left: pct(cd) }}><span>Contract {fmt.n0(cd)}</span></div>
      {projected ? <div className="mark" style={{ left: pct(projected), background: 'var(--serious)' }} /> : null}
    </div>
  );
}

export function ZoneLegend({ zones }: { zones: Zone[] }) {
  return (
    <div className="row small" style={{ gap: 14 }}>
      {zones.map((z) => (
        <span key={z.code} className="row" style={{ gap: 6 }}>
          <span className="zone-dot" style={{ background: zoneColor(z.code) }} />{z.code} {z.label} ({z.from}–{z.to})
        </span>
      ))}
    </div>
  );
}
