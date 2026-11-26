import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, cssVar, fmt, Loading, refLine, useApi, wave } from '../lib';
import { Empty, Stat } from '../components/common';
import { useMe } from '../components/sign';

export const ROLE: Record<string, string> = {
  grid: 'Grid incomer', dg: 'DG set', solar: 'Solar', load: 'Machine / feeder', common: 'Common area', fuel: 'DG fuel tank sensor', chiller: 'Equipment controller (chiller)',
};
export const TAG: Record<string, string> = { critical: 'Must run', shiftable: 'Can move', sheddable: 'Can pause' };

export function StatusChip({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    online: ['s-good', 'Sending'], offline: ['s-critical', 'No data'], suspect: ['s-watch', 'Check meter'],
    waiting: ['s-neutral', 'Waiting'], disabled: ['s-neutral', 'Switched off'],
  };
  const [cls, label] = map[s] ?? ['s-neutral', s];
  return <span className={`chip ${cls}`}>{label}</span>;
}

export function AlarmChip({ live }: { live: any }) {
  if (!live || (live.alarmPresent == null && live.shutdownAlarm == null)) return <span className="muted">–</span>;
  if (live.shutdownAlarm >= 0.5) return <span className="chip s-critical">Shut down{live.lastDiag ? `, code ${live.lastDiag}` : ''}</span>;
  if (live.alarmPresent >= 0.5) return <span className="chip s-serious">Alarm{live.lastDiag ? `, code ${live.lastDiag}` : ''}</span>;
  return <span className="chip s-good">No alarm</span>;
}

const PERIODS: [string, string][] = [['1h', 'Live 1 h'], ['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['12m', '12 months']];

const DOT: Record<string, string> = { online: 'var(--good)', offline: 'var(--critical)', suspect: 'var(--warning)' };

export default function Meters() {
  const q = useApi<any[]>('/meters', 5000);
  const { can } = useMe();
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { if (sel == null && q.data?.length) setSel(q.data[0].meter.id); }, [q.data, sel]);
  if (!q.data) return <Loading error={q.error} />;
  const selected = q.data.find((m) => m.meter.id === sel);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Meters</h1>
        {can('configure') && <Link className="btn" to="/settings/meters">Add or change meters</Link>}
      </div>
      {q.data.length === 0 ? (
        <div className="card"><Empty title="No meters yet">Add one in Settings → Meters.</Empty></div>
      ) : (
        <div className="grid g-side">
          <div className="side-col">
            <section className="card" style={{ padding: 12 }}>
              <div className="mlist">
                {q.data.map((m) => (
                  <button key={m.meter.id} className={sel === m.meter.id ? 'on' : ''} onClick={() => setSel(m.meter.id)}>
                    <span className="st" style={{ background: DOT[m.status] ?? 'var(--muted)' }} />
                    <span style={{ minWidth: 0 }}><div className="n">{m.meter.name}</div><div className="m">{ROLE[m.meter.role]}</div></span>
                    <span className="m num">{m.meter.role === 'fuel' ? `${fmt.n0(m.live?.fuelL)} L` : `${fmt.n0(m.live?.kw)} kW`}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          {selected && <MeterTrends key={selected.meter.id} m={selected} />}
        </div>
      )}
    </div>
  );
}

function MeterTrends({ m }: { m: any }) {
  const [period, setPeriod] = useState('24h');
  const role = m.meter.role as string;
  const q = useApi<any>(`/meters/${m.meter.id}/trend?period=${period}`, period === '1h' ? 10000 : 60000);
  const d = q.data;
  const isEnergy = !['fuel', 'chiller'].includes(role);
  const label = (p: any) => (p.date ? (period === '12m' ? fmt.month(p.date) : fmt.date(p.date))
    : period === '1h' ? new Date(p.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : period === '24h' ? fmt.time(p.t) : fmt.dateTime(p.t));

  const charts = useMemo(() => {
    if (!d?.points?.length) return null;
    const pts = d.points as any[];
    const x = { type: 'category', data: pts.map(label), boundaryGap: false };
    const c1 = cssVar('--charcoal'), c2 = cssVar('--horizon'), c3 = cssVar('--ygreen'), red = cssVar('--critical');
    const agg = period === '30d' || period === '12m';
    const out: Record<string, any> = {};
    out.power = {
      legend: { data: role === 'chiller' ? ['kW'] : ['kW', agg ? 'Peak kVA (MD)' : 'kVA'] },
      xAxis: x, yAxis: { type: 'value', name: role === 'chiller' ? 'kW' : 'kW / kVA' },
      tooltip: { valueFormatter: (v: any) => (v == null ? '–' : fmt.n1(v)) },
      series: role === 'chiller' ? [wave('kW', c2, pts.map((p) => p.kw))]
        : [wave('kW', c1, pts.map((p) => p.kw)), wave(agg ? 'Peak kVA (MD)' : 'kVA', c2, pts.map((p) => p.kva), { area: false })],
    };
    if (isEnergy && role !== 'solar') {
      const pf = pts.map((p) => p.pf);
      const vals = pf.filter((v) => v != null && v > 0) as number[];
      const min = Math.min(...(vals.length ? vals : [1]), d.pfAlarm) - 0.01;
      out.pf = {
        legend: { data: ['Actual PF', 'PF alarm level (set)'] },
        xAxis: x, yAxis: { type: 'value', min: Math.max(0, Math.floor(min * 100) / 100), max: 1, axisLabel: { formatter: (v: number) => v.toFixed(3) } },
        tooltip: { valueFormatter: (v: any) => (v == null ? '–' : Number(v).toFixed(3)) },
        series: [wave('Actual PF', c2, pf, { area: false }), refLine('PF alarm level (set)', red, d.pfAlarm, pts.length)],
      };
    }
    if (isEnergy && period !== '1h') {
      out.energy = {
        legend: { data: ['kVAh', 'kWh'] },
        xAxis: x, yAxis: { type: 'value', name: agg ? 'per ' + (period === '12m' ? 'month' : 'day') : 'per 15 min' },
        tooltip: { valueFormatter: (v: any) => fmt.n1(v) },
        series: [wave('kVAh', c1, pts.map((p) => p.kvah)), wave('kWh', c3, pts.map((p) => p.kwh), { area: false })],
      };
    }
    if (isEnergy && pts.some((p) => p.vln != null || p.vMin != null)) {
      out.volt = {
        legend: { data: period === '1h' ? ['Voltage L-N'] : ['Lowest voltage L-N', 'Unbalance %'] },
        xAxis: x,
        yAxis: [{ type: 'value', name: 'V', scale: true }, ...(period === '1h' ? [] : [{ type: 'value', name: '%', splitLine: { show: false } }])],
        tooltip: { valueFormatter: (v: any) => (v == null ? '–' : fmt.n1(v)) },
        series: period === '1h' ? [wave('Voltage L-N', c1, pts.map((p) => p.vln), { area: false })]
          : [wave('Lowest voltage L-N', c1, pts.map((p) => p.vMin), { area: false }), wave('Unbalance %', '#e8a33d', pts.map((p) => p.vUnb), { area: false, yAxisIndex: 1 })],
      };
    }
    if (period === '1h' && isEnergy && pts.some((p) => p.amps != null)) {
      out.amps = { xAxis: x, yAxis: { type: 'value', name: 'A', scale: true }, tooltip: { valueFormatter: (v: any) => `${fmt.n1(v)} A` }, series: [wave('Current (average of 3 phases)', c3, pts.map((p) => p.amps))] };
    }
    if (role === 'fuel') {
      out.fuel = { xAxis: x, yAxis: { type: 'value', name: 'litres', min: 0 }, tooltip: { valueFormatter: (v: any) => `${fmt.n0(v)} L` }, series: [wave('Diesel in tank', c1, pts.map((p) => p.fuelL))] };
    }
    if (role === 'chiller') {
      out.alarm = {
        legend: { data: ['Alarm present', 'Shutdown alarm'] },
        xAxis: x, yAxis: { type: 'value', min: 0, max: 1, interval: 1, axisLabel: { formatter: (v: number) => (v ? 'On' : 'Off') } },
        tooltip: { valueFormatter: (v: any) => (v == null ? '–' : v >= 0.5 ? 'On' : 'Off') },
        series: [wave('Alarm present', '#e8a33d', pts.map((p) => p.alarm), { step: 'end', smooth: false }), wave('Shutdown alarm', red, pts.map((p) => p.shutdown), { step: 'end', smooth: false, area: false })],
      };
    }
    return out;
  }, [d, period]);

  const pts = d?.points ?? [];
  const sum = (k: string) => pts.reduce((s: number, p: any) => s + (p[k] ?? 0), 0);
  const peak = pts.reduce((s: number, p: any) => Math.max(s, p.kva ?? p.kw ?? 0), 0);
  const pfAvg = sum('kvah') > 0 ? sum('kwh') / sum('kvah') : null;
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div><h2>{m.meter.name}</h2><div className="small muted">{ROLE[role]}{m.meter.area ? ` · ${m.meter.area}` : ''} · last reading {fmt.ago(m.lastSeen)}</div></div>
          <div className="row"><StatusChip s={m.status} /><AlarmChip live={m.live} /></div>
        </div>
        {isEnergy && (
          <div className="now-tiles" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            <div className="now-tile"><div className="h">kW</div><div className="v">{fmt.n1(m.live?.kw)}</div></div>
            <div className="now-tile"><div className="h">kVA</div><div className="v">{fmt.n1(m.live?.kva)}</div></div>
            <div className="now-tile"><div className="h">PF</div><div className="v">{fmt.pf(m.live?.pf)}</div></div>
            <div className="now-tile"><div className="h">Voltage L-N</div><div className="v">{fmt.n1(m.live?.vln)}<small> V</small></div></div>
            <div className="now-tile"><div className="h">Current</div><div className="v">{fmt.n0(m.live?.i1)}<small> A</small></div></div>
            <div className="now-tile"><div className="h">Energy</div><div className="v" style={{ fontSize: 20 }}>{fmt.n0(m.live?.kvah)}<small> kVAh</small></div></div>
          </div>
        )}
      </section>
      <section className="card stack">
      <div className="card-head">
        <h2>Trends</h2>
        <div className="seg period-seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      </div>
      {isEnergy && period !== '1h' && pts.length > 0 && (
        <div className="grid g4">
          <Stat label="Energy" value={`${fmt.n0(sum('kvah'))} kVAh`} sub={`${fmt.n0(sum('kwh'))} kWh`} />
          <Stat label={period === '24h' || period === '7d' ? 'Highest 15-min kVA' : 'Highest MD'} value={`${fmt.n0(peak)} kVA`} sub={m.meter.ratedKva ? `${Math.round((peak / m.meter.ratedKva) * 100)}% of its ${fmt.n0(m.meter.ratedKva)} kVA rating` : undefined} />
          <Stat label="Average power factor" value={fmt.pf(pfAvg)} sub={pfAvg != null && pfAvg < d.pfAlarm ? `Below the ${d.pfAlarm} alarm level` : 'kWh ÷ kVAh'} />
          <Stat label="Now" value={`${fmt.n1(m.live?.kw)} kW`} sub={m.live?.vln ? `${fmt.n1(m.live.vln)} V, PF ${fmt.pf(m.live?.pf)}` : undefined} />
        </div>
      )}
      {role === 'chiller' && (
        <div className="grid g3">
          <Stat label="Compressor drive power now" value={`${fmt.n1(m.live?.kw)} kW`} />
          <Stat label="Alarm status" value={<AlarmChip live={m.live} />} sub="Alarm Present / Shutdown Alarm Present points" />
          <Stat label="Last diagnostic code" value={m.live?.lastDiag ? String(m.live.lastDiag) : 'None'} sub="Look it up on the chiller's Alarms screen" />
        </div>
      )}
      {!d ? <Loading error={q.error} /> : !charts ? <Empty title="No data for this period yet">{period === '1h' ? 'Live readings appear within a few seconds of the meter sending.' : 'History builds up as the meter sends data.'}</Empty> : (
        <div className="grid g2">
          {charts.power && <div><h3 className="small ink2">{role === 'chiller' ? 'Compressor drive power' : 'Power'}</h3><Chart option={charts.power} /></div>}
          {charts.alarm && <div><h3 className="small ink2">Alarm points</h3><Chart option={charts.alarm} /></div>}
          {charts.pf && <div><h3 className="small ink2">Power factor</h3><Chart option={charts.pf} /></div>}
          {charts.energy && <div><h3 className="small ink2">Energy</h3><Chart option={charts.energy} /></div>}
          {charts.volt && <div><h3 className="small ink2">Voltage</h3><Chart option={charts.volt} /></div>}
          {charts.amps && <div><h3 className="small ink2">Current</h3><Chart option={charts.amps} /></div>}
          {charts.fuel && <div><h3 className="small ink2">Diesel level</h3><Chart option={charts.fuel} /></div>}
        </div>
      )}
      {d?.events?.length > 0 && (
        <div className="table-wrap">
          <h3 className="small ink2">Events of this meter, last 30 days</h3>
          <table className="t">
            <thead><tr><th>What</th><th>From</th><th>To</th><th>Detail</th></tr></thead>
            <tbody>{d.events.slice(0, 12).map((e: any, i: number) => (
              <tr key={i}>
                <td>{e.kind === 'equipment_alarm' ? (e.detail?.shutdown ? <span className="chip s-critical">Shutdown alarm</span> : <span className="chip s-serious">Alarm</span>)
                  : e.kind === 'grid_fail' ? <span className="chip s-critical">Power cut</span> : e.kind === 'dg_run' ? <span className="chip s-watch">DG ran</span> : <span className="chip s-neutral">{e.kind}</span>}</td>
                <td>{fmt.dateTime(e.ts)}</td><td>{e.endTs ? fmt.dateTime(e.endTs) : <b>still on</b>}</td>
                <td className="small">{e.detail?.code != null ? `Diagnostic code ${e.detail.code}` : e.detail?.units != null ? `${fmt.n1(e.detail.units)} units, ${fmt.n1(e.detail.litres)} L` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      </section>
    </div>
  );
}
