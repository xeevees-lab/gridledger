import { useMemo, useState } from 'react';
import { api, Chart, cssVar, fmt, Icon, inrAxis, Loading, useApi, wave, zoneColor } from '../lib';
import { Empty } from '../components/common';
import { isCancel, useMe } from '../components/sign';

type Line = { key: string; label: string; amount: number; note?: string };

function BillTable({ bill }: { bill: any }) {
  const rows: Line[] = [...bill.debit, ...bill.credit];
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Bill line</th><th>How it is worked out</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.key}><td><b>{l.label}</b></td><td className="small muted">{l.note}</td><td className="r">{fmt.inr(l.amount)}</td></tr>
          ))}
          <tr className="total"><td>Total as per tariff</td><td /><td className="r">{fmt.inr(bill.totalAsPerTariff)}</td></tr>
          <tr><td>Prompt payment discount</td><td className="small muted">If paid by the discount date</td><td className="r">−{fmt.inr(bill.ppd)}</td></tr>
          <tr><td>Payable if paid early</td><td /><td className="r">{fmt.inr(bill.payIfEarly)}</td></tr>
          <tr><td>Payable after the due date</td><td className="small muted">Delayed payment charges added</td><td className="r">{fmt.inr(bill.payIfLate)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function lastDay(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function Fig({ label, value, unit, sub, set }: { label: string; value: string; unit?: string; sub?: React.ReactNode; set?: boolean }) {
  return (
    <div className="card stat">
      <div className="label">{label}{set && <span className="set-tag" style={{ marginLeft: 8 }}>Set value</span>}</div>
      <div className="value num">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function Bill() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [mode, setMode] = useState<'month' | 'day'>('month');
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState(now.toISOString().slice(0, 10));
  const q = useApi<any>(mode === 'month' ? `/bill/month?month=${month}` : `/bill/day?date=${day}`, 60000);
  const c3 = useApi<any>(mode === 'day' ? `/chart3?period=day&date=${day}` : null, 60000);
  const sum = useApi<any>('/summary');
  const d = q.data;
  const cd = sum.data?.cdKva;

  const chart = useMemo(() => {
    const cU = cssVar('--chart-2'), cC = cssVar('--chart-1');
    if (mode === 'month') {
      if (!d?.daily?.length) return null;
      return {
        legend: { data: ['Units (kVAh)', 'Energy cost (₹)'] },
        xAxis: { type: 'category', data: d.daily.map((x: any) => fmt.date(x.date)), boundaryGap: false },
        yAxis: [{ type: 'value', name: 'kVAh' }, { type: 'value', name: '₹', splitLine: { show: false }, axisLabel: { formatter: inrAxis } }],
        tooltip: { valueFormatter: (v: any) => fmt.n0(v) },
        series: [wave('Units (kVAh)', cU, d.daily.map((x: any) => x.kvah), { showSymbol: true }), wave('Energy cost (₹)', cC, d.daily.map((x: any) => x.energyInr), { yAxisIndex: 1, area: false })],
      } as any;
    }
    const pts = c3.data?.points;
    if (!pts?.length) return null;
    return {
      legend: { data: ['Units (kVAh)', 'Energy cost (₹)'] },
      xAxis: { type: 'category', data: pts.map((p: any) => p.label), boundaryGap: false, axisLabel: { interval: 7 } },
      yAxis: [{ type: 'value', name: 'kVAh' }, { type: 'value', name: '₹', splitLine: { show: false } }],
      tooltip: { valueFormatter: (v: any) => fmt.n1(v) },
      series: [wave('Units (kVAh)', cU, pts.map((p: any) => p.kvah)), wave('Energy cost (₹)', cC, pts.map((p: any) => p.costInr), { yAxisIndex: 1, area: false })],
    } as any;
  }, [d, c3.data, mode]);
  const recordId = mode === 'month' ? `monthly:${month}` : `daily:${day}`;
  const b = d?.bill;

  return (
    <div className="stack">
      <div className="page-head"><h1>Electricity bill</h1></div>
      <div className="grid g-side">
        <div className="side-col">
          <section className="card" style={{ padding: 18 }}>
            <div className="seg vertical">
              <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Monthly bill</button>
              <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Daily bill</button>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>{mode === 'month' ? 'Month' : 'Date'}</label>
              {mode === 'month'
                ? <input className="input" type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
                : <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />}
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 14 }}>
              <a className="btn primary block" href={mode === 'month' ? `/api/reports/monthly?month=${month}` : `/api/reports/daily?date=${day}`} target="_blank" rel="noreferrer"><Icon.print size={16} />Print / PDF</a>
              <a className="btn block" href={mode === 'month' ? `/api/reports/data.csv?from=${month}-01&to=${lastDay(month)}` : `/api/reports/data.csv?from=${day}&to=${day}`}><Icon.download size={16} />15-min data (Excel)</a>
            </div>
          </section>
          <ReportSignatures recordId={recordId} kind={mode === 'month' ? 'monthly' : 'daily'} period={mode === 'month' ? month : day} />
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>{mode === 'month' ? 'Units and energy cost, day by day' : 'Units and energy cost, every 15 minutes'}</h2></div>
            {chart ? <Chart option={chart} /> : <Empty title="No readings for this period" />}
          </section>
          {!d ? <Loading error={q.error} /> : b.kvah === 0 ? null : (
            <>
              <div className="grid g4">
                <Fig label={mode === 'month' ? (d.current ? 'Bill so far' : 'Bill for the month') : 'Bill for the day'} value={fmt.inr(b.totalAsPerTariff)} sub={`₹${b.effectiveRatePerKvah.toFixed(2)} per kVAh overall`} />
                <Fig label="Billed units (kVAh)" value={fmt.n0(b.kvah)} unit="kVAh" sub={`${fmt.n0(b.kwh)} kWh`} />
                <Fig label="Billing demand (measured MD)" value={fmt.n0(b.billedDemandKva)} unit="kVA" sub={<>{b.billedDemandReason}{cd ? <> · CD <b>{fmt.n0(cd)} kVA</b> <span className="set-tag">Set value</span></> : null}</>} />
                <Fig label="Average PF · Load factor" value={`${fmt.pf(b.pfAvg)} · ${fmt.pct(b.loadFactorPct, 1)}`} sub="PF = kWh ÷ kVAh" />
              </div>
              <div className="grid g2">
                <section className="card">
                  <div className="card-head"><h2>TOD zones</h2></div>
                  <div className="table-wrap">
                    <table className="t">
                      <thead><tr><th>Zone</th><th className="r">kVAh</th><th className="r">Share</th><th className="r">TOD rebate / surcharge</th></tr></thead>
                      <tbody>{Object.entries(b.zoneKvah as Record<string, number>).map(([z, v]) => (
                        <tr key={z}><td><span className="row" style={{ gap: 8 }}><span className="zone-dot" style={{ background: zoneColor(z) }} />Zone {z}</span></td><td className="r">{fmt.n0(v)}</td><td className="r">{b.kvah ? fmt.pct((100 * v) / b.kvah, 1) : '–'}</td><td className="r">{fmt.inr(b.todByZone?.[z])}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
                {d.meters?.length > 0 && (
                  <section className="card">
                    <div className="card-head"><h2>By machine / area</h2></div>
                    <div className="table-wrap">
                      <table className="t">
                        <thead><tr><th>Meter</th><th className="r">kVAh</th><th className="r">Total</th></tr></thead>
                        <tbody>{d.meters.map((m: any) => (
                          <tr key={m.meterId}><td>{m.name}{m.isCommon && <span className="chip s-neutral" style={{ marginLeft: 6 }}>common</span>}</td><td className="r">{fmt.n0(m.kvah)}</td><td className="r"><b>{m.isCommon ? 'shared out' : fmt.inr(m.totalInr)}</b></td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
              <section className="card">
                <div className="card-head"><h2>Bill lines</h2></div>
                <BillTable bill={b} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Review / approval signatures of this period's report (21 CFR Part 11 §11.50, §11.70). */
function ReportSignatures({ recordId, kind, period }: { recordId: string; kind: string; period: string }) {
  const { can, signed } = useMe();
  const q = useApi<any[]>(`/signatures?recordType=report&recordId=${encodeURIComponent(recordId)}`);
  const [err, setErr] = useState<string | null>(null);
  const sign = async (meaning: 'review' | 'approve') => {
    setErr(null);
    try { await signed((c) => api('/reports/sign', { body: { kind, period, meaning }, change: c })); q.reload(); }
    catch (e: any) { if (!isCancel(e)) setErr(e.message); }
  };
  const sigs = q.data ?? [];
  const reviewed = sigs.some((g) => g.meaning === 'Reviewed');
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h2>Sign-off</h2>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
          {can('review') && <button className="btn sm" onClick={() => sign('review')}><Icon.pen size={14} />Sign as reviewed</button>}
          {can('approve') && <button className="btn primary sm" disabled={!reviewed} title={reviewed ? '' : 'Needs a review signature first'} onClick={() => sign('approve')}><Icon.pen size={14} />Approve</button>}
      </div>
      {sigs.length === 0 ? <p className="small muted">Not signed yet.</p> : (
        <div className="stack" style={{ gap: 6 }}>
          {sigs.map((g) => (
            <div className="sigline" key={g.id}>
              <span className={`chip ${g.meaning === 'Approved' ? 's-good' : 's-neutral'}`}>{g.meaning}</span>
              <span><b>{g.fullName}</b> ({g.username})</span>
              <span>{new Date(g.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
              {g.reason && <span className="muted">"{g.reason}"</span>}
              <span className="mono muted" title="SHA-256 of the signed data">{g.recordHash.slice(0, 16)}…</span>
            </div>
          ))}
        </div>
      )}
      {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
    </section>
  );
}
