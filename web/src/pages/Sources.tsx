import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chart, cssVar, fmt, Icon, Loading, useApi, wave } from '../lib';
import { Empty } from '../components/common';

const NAME: Record<string, string> = { grid: 'Grid (MSEDCL)', dg: 'DG set', solar: 'Solar' };
const ICON: Record<string, keyof typeof Icon> = { grid: 'bolt', dg: 'fuel', solar: 'sun' };
const COLOR = (r: string) => cssVar(r === 'grid' ? '--chart-1' : r === 'dg' ? '--ink' : '--zone-C');

function SourceCard({ role }: { role: string }) {
  const q = useApi<any>(`/source/${role}`, 10000);
  const d = q.data;
  const I = Icon[ICON[role]];
  return (
    <Link to={`/sources/${role}`} className="card src-card">
      <div className="spread"><span className="row" style={{ gap: 10 }}><span className="k-icon" style={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}><I size={20} /></span><h2>{NAME[role]}</h2></span>
        {d && (d.meterCount === 0 ? <span className="chip s-neutral">No meter</span> : <span className={`chip ${d.live.kw > 0.5 ? 's-good' : 's-neutral'}`}>{d.live.kw > 0.5 ? 'Running' : 'Off'}</span>)}</div>
      {!d ? <Loading error={q.error} /> : (
        <>
          <div className="big" style={{ marginTop: 16 }}>{fmt.n0(d.live.kw)}<small>kW now</small></div>
          <dl className="kvlist">
            <dt>Today</dt><dd>{fmt.n0(d.today.kwh)} kWh</dd>
            <dt>This month</dt><dd>{fmt.n0(d.month.kwh)} kWh</dd>
            <dt>{role === 'solar' ? 'Value at grid rate (month)' : 'Cost this month'}</dt><dd>{fmt.inr(d.month.inr)}</dd>
          </dl>
          <span className="go">Open {NAME[role]} <Icon.arrow size={16} /></span>
        </>
      )}
    </Link>
  );
}

export default function Sources() {
  const q = useApi<any>('/sources', 30000);
  const d = q.data;
  const chart = useMemo(() => {
    if (!d?.daily?.length) return null;
    const s = (name: string, key: string, role: string) => wave(name, COLOR(role), d.daily.map((x: any) => x[key]), { area: role === 'grid', showSymbol: true });
    const series: any[] = [s('Grid', 'gridKwh', 'grid')];
    if (d.hasDg) series.push(s('DG', 'dgKwh', 'dg'));
    if (d.hasSolar) series.push(s('Solar', 'solarKwh', 'solar'));
    return {
      legend: { data: series.map((x) => x.name) },
      xAxis: { type: 'category', data: d.daily.map((x: any) => fmt.date(x.date)), boundaryGap: false },
      yAxis: { type: 'value', name: 'kWh' },
      tooltip: { valueFormatter: (v: any) => `${fmt.n0(v)} kWh` },
      series,
    } as any;
  }, [d]);
  return (
    <div className="stack">
      <div className="page-head"><h1>Grid · DG · Solar</h1></div>
      <section className="card">
        <div className="card-head"><h2>Units from each source, last 14 days</h2></div>
        {!d ? <Loading error={q.error} /> : chart ? <Chart option={chart} className="chart tall" /> : <Empty title="No readings yet" />}
      </section>
      <div className="grid g3">{['grid', 'dg', 'solar'].map((r) => <SourceCard key={r} role={r} />)}</div>
    </div>
  );
}

export function SourcePage() {
  const { role = 'grid' } = useParams();
  const q = useApi<any>(`/source/${role}`, 10000);
  const d = q.data;
  const charts = useMemo(() => {
    if (!d) return null;
    const c = COLOR(role);
    return {
      today: d.todayBlocks.length ? {
        legend: { data: ['kW', 'kVA'] },
        xAxis: { type: 'category', data: d.todayBlocks.map((b: any) => b.label), boundaryGap: false, axisLabel: { interval: 7 } },
        yAxis: { type: 'value', name: 'kW / kVA' },
        tooltip: { valueFormatter: (v: any) => fmt.n1(v) },
        series: [wave('kW', c, d.todayBlocks.map((b: any) => b.kw)), wave('kVA', cssVar('--chart-2'), d.todayBlocks.map((b: any) => b.kva), { area: false })],
      } : null,
      daily: d.daily.length ? {
        legend: { data: ['kWh', 'kVAh', 'MD (kVA)'] },
        xAxis: { type: 'category', data: d.daily.map((b: any) => b.label), boundaryGap: false },
        yAxis: [{ type: 'value', name: 'kWh / kVAh' }, { type: 'value', name: 'kVA', splitLine: { show: false } }],
        tooltip: { valueFormatter: (v: any) => fmt.n0(v) },
        series: [wave('kWh', c, d.daily.map((b: any) => b.kwh), { showSymbol: true }), wave('kVAh', cssVar('--chart-2'), d.daily.map((b: any) => b.kvah), { area: false }), wave('MD (kVA)', cssVar('--muted'), d.daily.map((b: any) => b.mdKva), { yAxisIndex: 1, area: false })],
      } : null,
    } as any;
  }, [d, role]);
  const P = ({ t, p }: { t: string; p: any }) => (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 6 }}><h2>{t}</h2></div>
      <div className="big" style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.03em' }}>{fmt.n0(p.kwh)}<small style={{ fontSize: 15, color: 'var(--muted)', marginLeft: 6 }}>kWh</small></div>
      <dl className="kvlist">
        <dt>kVAh</dt><dd>{fmt.n0(p.kvah)}</dd>
        <dt>MD (highest 15-min)</dt><dd>{fmt.n0(p.mdKva)} kVA</dd>
        <dt>Average PF</dt><dd>{fmt.pf(p.pf)}</dd>
        <dt>kVARh lag / lead</dt><dd>{fmt.n0(p.kvarhLag)} / {fmt.n0(p.kvarhLead)}</dd>
        <dt>Running hours</dt><dd>{fmt.n1(p.runHours)} h</dd>
        {role === 'dg' && <><dt>Diesel used (from kWh)</dt><dd>{fmt.n0(p.fuelL)} L</dd></>}
        <dt>{role === 'grid' ? 'Bill (MSEDCL tariff)' : role === 'dg' ? 'Diesel cost' : 'Value at grid rate'}</dt><dd>{fmt.inr(p.inr)}</dd>
      </dl>
    </section>
  );
  return (
    <div className="stack">
      <div>
        <Link to="/sources" className="back"><Icon.back size={16} />Grid · DG · Solar</Link>
        <div className="page-head">
          <h1>{NAME[role] ?? role}</h1>
          <div className="seg">{['grid', 'dg', 'solar'].map((r) => <Link key={r} to={`/sources/${r}`} style={{ textDecoration: 'none' }}><button className={r === role ? 'on' : ''}>{NAME[r]}</button></Link>)}</div>
        </div>
      </div>
      {!d ? <Loading error={q.error} /> : d.meterCount === 0 ? <div className="card"><Empty title={`No ${NAME[role]} meter`}>Add a meter with this role in Settings → Meters.</Empty></div> : (
        <>
          <div className="now-tiles card" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            <div className="now-tile"><div className="h">kW now</div><div className="v">{fmt.n1(d.live.kw)}</div></div>
            <div className="now-tile"><div className="h">kVA now</div><div className="v">{fmt.n1(d.live.kva)}</div></div>
            <div className="now-tile"><div className="h">Power factor</div><div className="v">{fmt.pf(d.live.pf)}</div></div>
            <div className="now-tile"><div className="h">Voltage</div><div className="v">{d.live.v == null ? '–' : fmt.n1(d.live.v)}<small> V</small></div></div>
            <div className="now-tile"><div className="h">Current (avg)</div><div className="v">{d.live.i == null ? '–' : fmt.n0(d.live.i)}<small> A</small></div></div>
            <div className="now-tile"><div className="h">{role === 'dg' ? 'Diesel in tank' : 'Frequency'}</div><div className="v">{role === 'dg' ? (d.live.fuelL == null ? '–' : <>{fmt.n0(d.live.fuelL)}<small> L</small></>) : d.live.hz == null ? '–' : <>{d.live.hz.toFixed(2)}<small> Hz</small></>}</div></div>
          </div>
          <section className="card"><div className="card-head"><h2>Today, every 15 minutes</h2></div>{charts?.today ? <Chart option={charts.today} className="chart tall" /> : <Empty title="No readings today" />}</section>
          <div className="grid g3">
            <P t="Today" p={d.today} />
            <P t="This month" p={d.month} />
            <section className="card">
              <div className="card-head" style={{ marginBottom: 6 }}><h2>{role === 'grid' ? 'Power cuts' : role === 'dg' ? 'DG runs' : 'Meters'}</h2></div>
              {role === 'solar' || d.events.length === 0 ? (
                <dl className="kvlist" style={{ borderTop: 0 }}>{d.meters.flatMap((m: any) => [<dt key={`n${m.id}`}>{m.name}</dt>, <dd key={`v${m.id}`}>{fmt.n1(m.kw)} kW</dd>])}{role !== 'solar' && <><dt>Last 30 days</dt><dd>none</dd></>}</dl>
              ) : (
                <table className="t"><thead><tr><th>Started</th><th className="r">Minutes</th></tr></thead><tbody>{d.events.slice(0, 8).map((e: any, i: number) => <tr key={i}><td>{e.start}</td><td className="r">{e.minutes == null ? 'still on' : fmt.n0(e.minutes)}</td></tr>)}</tbody></table>
              )}
            </section>
          </div>
          <section className="card"><div className="card-head"><h2>Last 30 days</h2></div>{charts?.daily ? <Chart option={charts.daily} /> : <Empty title="No readings yet" />}</section>
        </>
      )}
    </div>
  );
}
