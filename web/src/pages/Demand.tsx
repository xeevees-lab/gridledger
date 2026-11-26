import { useMemo } from 'react';
import { Chart, cssVar, fmt, Loading, refLine, useApi, wave } from '../lib';
import { Empty, MdBar } from '../components/common';

function Row({ k, v, set }: { k: string; v: string; set?: boolean }) {
  return <><dt>{k}</dt><dd>{v}{set && <span className="set-tag" style={{ marginLeft: 6 }}>Set</span>}</dd></>;
}

export default function Demand() {
  const q = useApi<any>('/demand', 30000);
  const blk = useApi<any>('/block', 5000);
  const c3 = useApi<any>('/chart3?period=day', 60000);
  const d = q.data;
  const b = blk.data;

  const today = useMemo(() => {
    const pts = c3.data?.points;
    if (!pts?.length || !d) return null;
    const n = pts.length;
    return {
      legend: { data: ['15-min kVA', 'Contract demand (set)', 'This month\'s MD'] },
      xAxis: { type: 'category', data: pts.map((p: any) => p.label), boundaryGap: false, axisLabel: { interval: 7 } },
      yAxis: { type: 'value', name: 'kVA', max: Math.ceil((d.cdKva * 1.1) / 100) * 100 },
      tooltip: { formatter: (ps: any[]) => { const p = pts[ps[0].dataIndex]; return `<b>${p.label}</b> · Zone ${p.zone}<br/>${fmt.n0(p.mdKva)} kVA${p.mdCounted ? '' : ' (not counted for MD)'}`; } },
      series: [
        wave('15-min kVA', cssVar('--chart-1'), pts.map((p: any) => p.mdKva)),
        refLine('Contract demand (set)', cssVar('--critical'), d.cdKva, n),
        refLine('This month\'s MD', cssVar('--chart-2'), d.monthMdKva, n),
      ],
    } as any;
  }, [c3.data, d]);

  const daily = useMemo(() => {
    if (!d?.daily?.length) return null;
    const n = d.daily.length;
    return {
      legend: { data: ['Day\'s MD', 'Month MD so far', 'Contract demand (set)'] },
      xAxis: { type: 'category', data: d.daily.map((x: any) => fmt.date(x.date)), boundaryGap: false },
      yAxis: { type: 'value', name: 'kVA', max: Math.ceil((d.cdKva * 1.1) / 100) * 100 },
      tooltip: { valueFormatter: (v: any) => (v == null ? '–' : `${fmt.n0(v)} kVA`) },
      series: [
        wave('Day\'s MD', cssVar('--chart-1'), d.daily.map((x: any) => x.peakKva), { showSymbol: true }),
        wave('Month MD so far', cssVar('--chart-2'), d.daily.map((x: any) => x.monthMdKva), { area: false, step: 'end', smooth: false }),
        refLine('Contract demand (set)', cssVar('--critical'), d.cdKva, n),
      ],
    } as any;
  }, [d]);

  const months = useMemo(() => {
    const h = (d?.history ?? []).filter((x: any) => x.source !== 'bill');
    if (!h.length) return null;
    return {
      xAxis: { type: 'category', data: h.map((x: any) => fmt.month(x.month)), boundaryGap: false },
      yAxis: { type: 'value', name: 'kVA', max: Math.ceil((d.cdKva * 1.1) / 100) * 100 },
      tooltip: { valueFormatter: (v: any) => `${fmt.n0(v)} kVA` },
      series: [wave('Monthly MD (measured)', cssVar('--ink'), h.map((x: any) => x.mdKva), { showSymbol: true }), refLine('Contract demand (set)', cssVar('--critical'), d.cdKva, h.length)],
    } as any;
  }, [d]);

  if (!d) return <Loading error={q.error} />;
  return (
    <div className="stack">
      <div className="page-head"><h1>MD</h1></div>
      <div className="grid g-side">
        <div className="side-col">
          <section className="card">
            <div className="card-head" style={{ marginBottom: 8 }}><h2>Set values</h2></div>
            <dl className="kvlist" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <Row k="Contract demand (CD)" v={`${fmt.n0(d.cdKva)} kVA`} set />
              <Row k="Minimum billed (75% of CD)" v={`${fmt.n0(d.floorKva)} kVA`} set />
              <Row k="MD alert level" v={`${fmt.n0(d.targetKva)} kVA`} set />
              <Row k="MD block" v={b ? `${b.blockMin} min` : '15 min'} set />
              <Row k="Not counted" v="Zone A (night)" set />
            </dl>
          </section>
          <section className="card">
            <div className="card-head" style={{ marginBottom: 8 }}><h2>Current block</h2>{b && <span className={`chip ${b.counted ? 's-info' : 's-neutral'}`}>{b.counted ? 'Counted' : 'Not counted'}</span>}</div>
            {!b ? <Loading error={blk.error} /> : (
              <dl className="kvlist" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                <Row k="Block" v={`${b.start}–${b.end}`} />
                <Row k="Zone" v={`${b.zone} · ${b.zoneLabel}`} />
                <Row k="Minutes gone" v={`${fmt.n1(b.elapsedMin)} of ${b.blockMin}`} />
                <Row k="kVAh so far" v={fmt.n1(b.kvahSoFar)} />
                <Row k="Average kVA so far" v={b.avgKvaSoFar == null ? '–' : `${fmt.n0(b.avgKvaSoFar)} kVA`} />
                <Row k="Load now" v={`${fmt.n0(b.nowKva)} kVA`} />
                <Row k="PF so far" v={fmt.pf(b.pfSoFar)} />
              </dl>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Today, every 15 minutes</h2></div>
            {today ? <Chart option={today} className="chart tall" /> : <Empty title="No readings yet today" />}
          </section>
          <div className="grid g3">
            <div className="card stat"><div className="label">This month's MD (measured)</div><div className="value num">{fmt.n0(d.monthMdKva)}<small>kVA</small></div><div className="sub">CD {fmt.n0(d.cdKva)} kVA <span className="set-tag">Set value</span></div></div>
            <div className="card stat"><div className="label">Billing demand</div><div className="value num">{fmt.n0(d.billedKva)}<small>kVA</small></div><div className="sub">{d.billedReason}</div></div>
            <div className="card stat"><div className="label">MD used of CD</div><div className="value num">{d.cdKva ? Math.round((100 * d.monthMdKva) / d.cdKva) : 0}<small>%</small></div><MdBar md={d.monthMdKva} floor={d.floorKva} cd={d.cdKva} /></div>
          </div>
          <div className="grid g2">
            <section className="card"><div className="card-head"><h2>MD each day, this month</h2></div>{daily ? <Chart option={daily} /> : <Empty title="No data yet this month" />}</section>
            <section className="card"><div className="card-head"><h2>MD each month</h2></div>{months ? <Chart option={months} /> : <Empty title="No finished month yet">Monthly MD appears after the first full month of readings.</Empty>}</section>
          </div>
        </div>
      </div>
    </div>
  );
}
