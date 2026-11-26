import { useMemo } from 'react';
import { Chart, cssVar, fmt, Loading, refLine, useApi, wave } from '../lib';
import { Empty } from '../components/common';

function Status({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return ok ? <span className="chip s-good">OK</span> : warn ? <span className="chip s-watch">Watch</span> : <span className="chip s-serious">High</span>;
}

export default function Quality() {
  const q = useApi<any>('/quality', 60000);
  const d = q.data;
  const pf = useMemo(() => {
    if (!d?.daily?.length) return null;
    const vals = d.daily.map((x: any) => x.pf).filter((v: any) => v != null);
    const min = Math.min(...vals, d.pfAlarm) - 0.003;
    return {
      xAxis: { type: 'category', data: d.daily.map((x: any) => fmt.date(x.date)), boundaryGap: false },
      tooltip: { formatter: (p: any) => { const x = d.daily[p[0].dataIndex]; return `${fmt.date(x.date)}<br/>PF ${fmt.pf(x.pf)}<br/>Extra billed units ${fmt.n0(x.lostKvah)}`; } },
      legend: { data: ['Actual PF', 'PF alarm level (set)', 'Extra billed units (kVAh)'] },
      yAxis: [
        { type: 'value', min: Math.floor(min * 1000) / 1000, max: 1, axisLabel: { formatter: (v: number) => v.toFixed(3) } },
        { type: 'value', name: 'kVAh', splitLine: { show: false } },
      ],
      series: [
        wave('Actual PF', cssVar('--chart-1'), d.daily.map((x: any) => x.pf), { showSymbol: true }),
        refLine('PF alarm level (set)', cssVar('--critical'), d.pfAlarm, d.daily.length),
        wave('Extra billed units (kVAh)', cssVar('--chart-2'), d.daily.map((x: any) => x.lostKvah), { yAxisIndex: 1, area: false }),
      ],
    } as any;
  }, [d]);
  if (!d) return <Loading error={q.error} />;
  const sum = (k: string) => d.daily.reduce((s: number, x: any) => s + (x[k] ?? 0), 0);
  const pfs = d.daily.map((x: any) => x.pf).filter((v: any) => v != null);
  const avgPf = pfs.length ? pfs.reduce((a: number, b: number) => a + b, 0) / pfs.length : null;
  const lost = sum('lostKvah'), lag = sum('lagKvarh'), lead = sum('leadKvarh');
  return (
    <div className="stack">
      <div className="page-head"><h1>Power quality</h1></div>
      <div className="grid g4">
        <div className="card stat"><div className="label">Average PF, last 30 days</div><div className="value num">{fmt.pf(avgPf)}</div><div className="sub">PF alarm level {d.pfAlarm} <span className="set-tag">Set value</span></div></div>
        <div className="card stat"><div className="label">Extra billed units</div><div className="value num">{fmt.n0(lost)}<small>kVAh</small></div><div className="sub">kVAh above kWh, last 30 days</div></div>
        <div className="card stat"><div className="label">kVARh lag</div><div className="value num">{fmt.n0(lag)}</div><div className="sub">Last 30 days</div></div>
        <div className="card stat"><div className="label">kVARh lead</div><div className="value num">{fmt.n0(lead)}</div><div className="sub">Last 30 days</div></div>
      </div>
      <section className="card">
        <div className="card-head"><h2>PF vs actual, last 30 days</h2></div>
        {pf ? <Chart option={pf} className="chart tall" /> : <Empty title="No data yet" />}
      </section>
      <section className="card">
        <div className="card-head"><h2>Each meter now</h2><span className="small muted">Unbalance limit {d.unbWarn}% · THD limits {d.thdVLimit}% V / {d.thdILimit}% I <span className="set-tag">Set values</span></span></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Meter</th><th className="r">Voltage (L-N)</th><th className="r">Frequency</th><th className="r">Power factor</th><th className="r">Voltage unbalance</th><th className="r">THD voltage</th><th className="r">THD current</th><th>Status</th></tr></thead>
            <tbody>{d.perMeter.map((m: any) => {
              const unbOk = m.vUnbPct == null || m.vUnbPct <= d.unbWarn;
              const thdOk = (m.thdV ?? 0) <= d.thdVLimit && (m.thdI ?? 0) <= d.thdILimit;
              return (
                <tr key={m.id}>
                  <td>{m.name}</td><td className="r">{fmt.n1(m.vln)} V</td><td className="r">{m.hz ? `${m.hz.toFixed(2)} Hz` : '–'}</td><td className="r">{fmt.pf(m.pf)}</td>
                  <td className="r">{m.vUnbPct == null ? '–' : `${m.vUnbPct.toFixed(2)}%`}</td><td className="r">{m.thdV == null ? 'not measured' : `${m.thdV.toFixed(1)}%`}</td><td className="r">{m.thdI == null ? 'not measured' : `${m.thdI.toFixed(1)}%`}</td>
                  <td><Status ok={unbOk && thdOk} warn={!unbOk && (m.vUnbPct ?? 0) <= d.unbCrit} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
