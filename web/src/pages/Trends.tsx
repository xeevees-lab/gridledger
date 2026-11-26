import { useMemo, useState } from 'react';
import { Chart, cssVar, fmt, inrAxis, Loading, palette, pieOption, refLine, useApi, wave, zoneColor } from '../lib';
import { Empty } from '../components/common';
import { RightNow, ThreeWave } from './Overview';

const PERIODS: [string, string][] = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months']];

function Change({ now, before, goodWhenDown = true }: { now: number; before: number; goodWhenDown?: boolean }) {
  if (!before) return <span className="muted">no earlier data to compare</span>;
  const pct = (now / before - 1) * 100;
  const good = goodWhenDown ? pct <= 0 : pct >= 0;
  return (
    <span style={{ color: Math.abs(pct) < 0.5 ? 'var(--muted)' : good ? 'var(--good-ink)' : 'var(--critical)', fontWeight: 600 }}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct).toFixed(1)}% vs previous period
    </span>
  );
}

export default function Trends() {
  const [period, setPeriod] = useState('30d');
  const [meter, setMeter] = useState<string>('');
  const meters = useApi<any[]>('/meters');
  const ov = useApi<any>('/overview');
  const q = useApi<any>(`/trends?period=${period}${meter ? `&meterId=${meter}` : ''}`, 120000);
  const d = q.data;
  const label = (x: string) => (d?.monthly ? fmt.month(x) : fmt.date(x));

  const charts = useMemo(() => {
    if (!d?.buckets?.length) return null;
    const b = d.buckets as any[];
    const prev = d.previous as any[];
    const n = b.length;
    const x = { type: 'category', data: b.map((r) => label(r.date)), boundaryGap: false };
    const zones: string[] = Object.keys(b[0].zoneKvah);
    const L = d.limits ?? {};
    const zoneName = (z: string) => ov.data?.zones?.find((x: any) => x.code === z)?.label;
    // Month MD so far: the running highest peak inside each month (what the month is billed on)
    let run = 0, curMonth = '';
    const monthMd = b.map((r) => { const m = r.date.slice(0, 7); if (m !== curMonth) { curMonth = m; run = 0; } run = Math.max(run, r.peakKva); return run; });
    const pfs = b.map((r) => r.pf).filter((v) => v != null) as number[];
    return {
      cost: {
        legend: { data: ['This period', 'Previous period'] },
        xAxis: x,
        yAxis: { type: 'value', name: '₹', axisLabel: { formatter: inrAxis } },
        tooltip: { valueFormatter: (v: any) => fmt.inr(v) },
        series: [
          wave('This period', cssVar('--chart-1'), b.map((r) => r.costInr)),
          wave('Previous period', cssVar('--chart-2'), b.map((_, i) => prev[i]?.costInr ?? null), { area: false, lineStyle: { type: [8, 5], width: 2.2, color: cssVar('--chart-2') } }),
        ],
      },
      zones: {
        legend: { data: zones.map((z) => `Zone ${z}`) },
        xAxis: x,
        yAxis: { type: 'value', name: 'kVAh' },
        tooltip: { valueFormatter: (v: any) => `${fmt.n0(v)} kVAh` },
        series: zones.map((z) => wave(`Zone ${z}`, zoneColor(z), b.map((r) => r.zoneKvah[z]), { area: false })),
      },
      todPie: pieOption(zones.map((z) => ({ name: `Zone ${z}${zoneName(z) ? ` (${zoneName(z)})` : ''}`, value: b.reduce((s, r) => s + (r.zoneKvah[z] ?? 0), 0), color: zoneColor(z) })), 'kVAh'),
      meterPie: !meter && d.machines.length ? pieOption(d.machines.filter((m: any) => m.kvah > 0).map((m: any, i: number) => ({ name: m.name, value: m.kvah, color: palette()[i % 12] })), 'kVAh') : null,
      md: {
        legend: { data: ['Actual MD', 'Month MD', 'Min. billed (set)', 'Contract demand (set)'] },
        xAxis: x,
        yAxis: { type: 'value', name: 'kVA', max: L.cdKva ? Math.ceil((L.cdKva * 1.08) / 100) * 100 : undefined },
        tooltip: { valueFormatter: (v: any) => (v == null ? '–' : `${fmt.n0(v)} kVA`) },
        series: [
          wave('Actual MD', cssVar('--chart-1'), b.map((r) => r.peakKva), { showSymbol: n <= 31 }),
          ...(meter ? [] : [
            wave('Month MD', cssVar('--chart-2'), monthMd, { area: false, step: d.monthly ? undefined : 'end', smooth: d.monthly ? 0.35 : false }),
            refLine('Min. billed (set)', cssVar('--ink-2'), L.floorKva, n),
            refLine('Contract demand (set)', cssVar('--critical'), L.cdKva, n),
          ]),
        ],
      },
      pf: {
        legend: { data: ['Actual PF', 'PF alarm level (set)'] },
        xAxis: x,
        yAxis: { type: 'value', min: Math.floor((Math.min(...(pfs.length ? pfs : [1]), L.pfAlarm ?? 0.995) - 0.003) * 1000) / 1000, max: 1, axisLabel: { formatter: (v: number) => v.toFixed(3) } },
        tooltip: { valueFormatter: (v: any) => (v == null ? '–' : Number(v).toFixed(3)) },
        series: [
          wave('Actual PF', cssVar('--chart-1'), b.map((r) => r.pf), { showSymbol: n <= 31 }),
          refLine('PF alarm level (set)', cssVar('--critical'), L.pfAlarm, n),
        ],
      },
    } as Record<string, any>;
  }, [d, ov.data, meter]);

  return (
    <div className="stack">
      <div className="page-head"><h1>Trends</h1></div>
      <RightNow ov={ov.data} />
      <ThreeWave />
      <div className="spread">
        <h2>History</h2>
        <div className="row">
          <div className="seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          <select className="input" style={{ width: 210 }} value={meter} onChange={(e) => setMeter(e.target.value)} aria-label="Meter">
            <option value="">Whole plant</option>
            {meters.data?.filter((m) => !['dg', 'solar', 'fuel'].includes(m.meter.role)).map((m) => <option key={m.meter.id} value={m.meter.id}>{m.meter.name}</option>)}
          </select>
        </div>
      </div>
      {!d ? <Loading error={q.error} /> : !d.buckets.length ? (
        <div className="card"><Empty title="No data for this period yet">Trends appear once meters have sent data for a day.</Empty></div>
      ) : (
        <>
          <div className="grid g4">
            <div className="card stat"><div className="label">Units used</div><div className="value num">{fmt.n0(d.totals.kvah)} <span style={{ fontSize: 14, fontWeight: 500 }}>kVAh</span></div><div className="sub"><Change now={d.totals.kvah} before={d.previousTotals.kvah} /></div></div>
            <div className="card stat"><div className="label">{meter ? 'Energy cost' : 'Cost (energy + demand)'}</div><div className="value num">{fmt.inrShort(d.totals.costInr)}</div><div className="sub"><Change now={d.totals.costInr} before={d.previousTotals.costInr} /></div></div>
            <div className="card stat"><div className="label">Highest demand</div><div className="value num">{fmt.n0(d.totals.peakKva)} <span style={{ fontSize: 14, fontWeight: 500 }}>kVA</span></div><div className="sub"><Change now={d.totals.peakKva} before={d.previousTotals.peakKva} /></div></div>
            <div className="card stat"><div className="label">Average cost per {d.monthly ? 'month' : 'day'}</div><div className="value num">{fmt.inr(d.totals.costInr / Math.max(1, d.totals.days))}</div><div className="sub">over {d.totals.days} {d.monthly ? 'months' : 'days'}</div></div>
          </div>
          <div className="grid g2">
            <section className="card"><div className="card-head"><h2>Cost per {d.monthly ? 'month' : 'day'}</h2><span className="small muted">Solid: this period · dashed: previous</span></div><Chart option={charts!.cost} /></section>
            <section className="card"><div className="card-head"><h2>Units by TOD zone</h2></div><Chart option={charts!.zones} /></section>
            <section className="card"><div className="card-head"><h2>TOD share</h2></div><Chart option={charts!.todPie} className="chart pie" /></section>
            {charts!.meterPie
              ? <section className="card"><div className="card-head"><h2>Share by meter</h2></div><Chart option={charts!.meterPie} className="chart pie" /></section>
              : <section className="card"><div className="card-head"><h2>Share by meter</h2></div><p className="muted small">Choose "Whole plant" to compare meters.</p></section>}
            <section className="card"><div className="card-head"><h2>MD vs actual</h2></div><Chart option={charts!.md} /></section>
            <section className="card"><div className="card-head"><h2>PF vs actual</h2></div><Chart option={charts!.pf} /></section>
          </div>
          {!meter && d.machines.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Machines and areas</h2></div>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Meter</th><th className="r">Units (kVAh)</th><th className="r">Energy cost</th><th className="r">Previous period</th><th className="r">Change</th><th /></tr></thead>
                  <tbody>{d.machines.map((m: any) => (
                    <tr key={m.meterId}>
                      <td>{m.name}</td><td className="r">{fmt.n0(m.kvah)}</td><td className="r">{fmt.inr(m.costInr)}</td><td className="r">{fmt.n0(m.prevKvah)}</td>
                      <td className="r" style={{ color: m.changePct == null || Math.abs(m.changePct) < 0.5 ? 'var(--muted)' : m.changePct > 0 ? 'var(--critical)' : 'var(--good-ink)', fontWeight: 600 }}>{m.changePct == null ? '–' : `${m.changePct > 0 ? '▲' : '▼'} ${Math.abs(m.changePct).toFixed(1)}%`}</td>
                      <td><button className="btn ghost sm" onClick={() => setMeter(String(m.meterId))}>See trend</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      <Forecast ov={ov.data} />
    </div>
  );
}

/** The only forecast in the app: today's expected load from past days, shown last and labelled as a forecast. */
function Forecast({ ov }: { ov: any }) {
  const option = useMemo(() => {
    if (!ov?.today?.forecast?.length) return null;
    const lab = (t: string) => fmt.time(t);
    const act = new Map<string, number>(ov.today.series.map((x: any) => [lab(x.t), x.kva]));
    const slots = ov.today.forecast.map((f: any) => lab(f.t));
    return {
      legend: { data: ['Measured (kVA)', 'Forecast (kVA)'] },
      xAxis: { type: 'category', data: slots, boundaryGap: false, axisLabel: { interval: 7 } },
      yAxis: { type: 'value', name: 'kVA' },
      tooltip: { valueFormatter: (v: any) => (v == null ? '–' : `${fmt.n0(v)} kVA`) },
      series: [
        wave('Measured (kVA)', cssVar('--chart-1'), slots.map((k: string) => act.get(k) ?? null)),
        wave('Forecast (kVA)', cssVar('--muted'), ov.today.forecast.map((f: any) => f.kva), { area: false, lineStyle: { type: [6, 6], width: 2, color: cssVar('--muted') } }),
      ],
    } as any;
  }, [ov]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Forecast: today's load</h2>
        {ov?.forecastInfo && <span className="chip s-neutral">Forecast · {ov.forecastInfo.method} · {ov.forecastInfo.daysOfData} days of data</span>}
      </div>
      {option ? <Chart option={option} /> : <Empty title="No forecast yet">A forecast needs at least a week of readings.</Empty>}
    </section>
  );
}
