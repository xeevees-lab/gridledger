import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chart, cssVar, fmt, Icon, Loading, useApi, wave, zoneColor } from '../lib';
import { Empty } from '../components/common';

function ZoneFigures({ z }: { z: any }) {
  return (
    <dl className="kvlist">
      <dt>kWh</dt><dd>{fmt.n0(z.kwh)}</dd>
      <dt>MD (highest 15-min)</dt><dd>{fmt.n0(z.mdKva)} kVA{z.mdAt ? <span className="muted" style={{ fontWeight: 400 }}> · {z.mdAt}</span> : null}</dd>
      <dt>Average PF</dt><dd>{fmt.pf(z.pf)}</dd>
      <dt>kVARh lag / lead</dt><dd>{fmt.n0(z.kvarhLag)} / {fmt.n0(z.kvarhLead)}</dd>
      <dt>Rate per unit</dt><dd>₹{z.unitInr.toFixed(2)}</dd>
      <dt>{z.rate > 0 ? 'TOD surcharge' : z.rate < 0 ? 'TOD rebate' : 'TOD charge'}</dt><dd>{fmt.inr(z.todInr)}</dd>
      <dt>Cost</dt><dd>{fmt.inr(z.costInr)}</dd>
      <dt>Counted in MD</dt><dd>{z.mdCounted ? 'Yes' : 'No'}</dd>
    </dl>
  );
}

function Period({ p, set }: { p: string; set: (v: string) => void }) {
  return (
    <div className="seg">
      <button className={p === 'today' ? 'on' : ''} onClick={() => set('today')}>Today</button>
      <button className={p === 'month' ? 'on' : ''} onClick={() => set('month')}>This month</button>
    </div>
  );
}

export default function Tod() {
  const [period, setPeriod] = useState('today');
  const q = useApi<any>(`/zones?period=${period}`, 30000);
  const t = useApi<any>('/tod', 60000);
  const chart = useMemo(() => {
    const daily = t.data?.daily;
    if (!daily?.length) return null;
    const codes = Object.keys(daily[0].zoneKvah);
    return {
      legend: { data: codes.map((c) => `Zone ${c}`) },
      xAxis: { type: 'category', data: daily.map((x: any) => fmt.date(x.date)), boundaryGap: false },
      yAxis: { type: 'value', name: 'kVAh' },
      tooltip: { valueFormatter: (v: any) => `${fmt.n0(v)} kVAh` },
      series: codes.map((c) => wave(`Zone ${c}`, zoneColor(c), daily.map((x: any) => x.zoneKvah[c]), { area: false, showSymbol: true })),
    } as any;
  }, [t.data]);
  return (
    <div className="stack">
      <div className="page-head"><h1>TOD</h1><Period p={period} set={setPeriod} /></div>
      <section className="card">
        <div className="card-head"><h2>Units in each zone, day by day</h2></div>
        {chart ? <Chart option={chart} /> : <Empty title="No readings yet" />}
      </section>
      {!q.data ? <Loading error={q.error} /> : (
        <div className="grid g4">
          {q.data.zones.map((z: any) => (
            <Link key={z.code} to={`/tod/${z.code}`} className="card zone-card">
              <div className="zh">
                <span className="zl"><i style={{ background: zoneColor(z.code), color: `var(--zone-${z.code}-ink)` }}>{z.code}</i>{z.label}</span>
                <Icon.arrow size={18} />
              </div>
              <div className="zt">{z.from}–{z.to} · {fmt.pct(z.sharePct, 1)} of units</div>
              <div className="zmain">{fmt.n0(z.kvah)}<small>kVAh</small></div>
              <ZoneFigures z={z} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ZonePage() {
  const { code = 'A' } = useParams();
  const [period, setPeriod] = useState('today');
  const q = useApi<any>(`/zones/${code}?period=${period}`, 30000);
  const d = q.data;
  const charts = useMemo(() => {
    if (!d) return null;
    const blocks = d.blocks as any[];
    const daily = d.daily as any[];
    const color = zoneColor(code);
    return {
      blocks: blocks.length ? {
        legend: { data: ['kVAh', 'MD (kVA)', 'Cost (₹)'] },
        xAxis: { type: 'category', data: blocks.map((b) => b.label), boundaryGap: false },
        yAxis: [{ type: 'value', name: 'kVAh / ₹' }, { type: 'value', name: 'kVA', splitLine: { show: false } }],
        tooltip: { valueFormatter: (v: any) => fmt.n1(v) },
        series: [wave('kVAh', color, blocks.map((b) => b.kvah)), wave('MD (kVA)', cssVar('--ink'), blocks.map((b) => b.mdKva), { yAxisIndex: 1, area: false }), wave('Cost (₹)', cssVar('--chart-2'), blocks.map((b) => b.costInr), { area: false })],
      } : null,
      daily: daily.length ? {
        legend: { data: ['kVAh', 'kWh', 'MD (kVA)'] },
        xAxis: { type: 'category', data: daily.map((b) => b.label), boundaryGap: false },
        yAxis: [{ type: 'value', name: 'kVAh / kWh' }, { type: 'value', name: 'kVA', splitLine: { show: false } }],
        tooltip: { valueFormatter: (v: any) => fmt.n0(v) },
        series: [wave('kVAh', color, daily.map((b) => b.kvah), { showSymbol: true }), wave('kWh', cssVar('--chart-2'), daily.map((b) => b.kwh), { area: false }), wave('MD (kVA)', cssVar('--ink'), daily.map((b) => b.mdKva), { yAxisIndex: 1, area: false })],
      } : null,
    } as any;
  }, [d, code]);
  return (
    <div className="stack">
      <div>
        <Link to="/tod" className="back"><Icon.back size={16} />TOD</Link>
        <div className="page-head">
          <h1>Zone {code}{d ? <small> · {d.zone.label} · {d.zone.from}–{d.zone.to}</small> : null}</h1>
          <div className="row">
            <div className="seg">{['A', 'B', 'C', 'D'].map((c) => <Link key={c} to={`/tod/${c}`} style={{ textDecoration: 'none' }}><button className={c === code ? 'on' : ''}>Zone {c}</button></Link>)}</div>
            <Period p={period} set={setPeriod} />
          </div>
        </div>
      </div>
      {!d ? <Loading error={q.error} /> : (
        <div className="grid g-side">
          <div className="side-col">
            <section className="card zone-card" style={{ cursor: 'default' }}>
              <div className="zh"><span className="zl"><i style={{ background: zoneColor(code), color: `var(--zone-${code}-ink)` }}>{code}</i>{d.zone.label}</span></div>
              <div className="zmain">{fmt.n0(d.zone.kvah)}<small>kVAh</small></div>
              <div className="zt">{fmt.pct(d.zone.sharePct, 1)} of {period === 'today' ? "today's" : "this month's"} units</div>
              <ZoneFigures z={d.zone} />
            </section>
          </div>
          <div className="stack">
            <section className="card"><div className="card-head"><h2>{period === 'today' ? 'Every 15 minutes, today' : 'Every 15 minutes, this month'}</h2></div>{charts?.blocks ? <Chart option={charts.blocks} className="chart tall" /> : <Empty title="No readings in this zone yet" />}</section>
            <section className="card"><div className="card-head"><h2>Day by day, this month</h2></div>{charts?.daily ? <Chart option={charts.daily} /> : <Empty title="No readings this month yet" />}</section>
          </div>
        </div>
      )}
    </div>
  );
}
