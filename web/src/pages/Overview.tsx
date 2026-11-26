import { useMemo, useState } from 'react';
import * as echarts from 'echarts';
import { Chart, cssVar, fmt, Icon, inrAxis, Loading, useApi, wave, zoneColor } from '../lib';
import { DayRibbon, Empty } from '../components/common';

/** One chart, three waves: cost (₹), units (kVAh) and MD (kVA), with the TOD zones marked. Used on Overview and Trends. */
export function ThreeWave({ height = 'chart tall' }: { height?: string }) {
  const [period, setPeriod] = useState<'day' | '7d' | '30d'>('day');
  const q = useApi<any>(`/chart3?period=${period}`, 60000);
  const d = q.data;
  const option = useMemo(() => {
    if (!d?.points?.length) return null;
    const pts = d.points as any[];
    const cCost = cssVar('--chart-1'), cUnits = cssVar('--chart-2'), cMd = cssVar('--chart-3');
    // Zone bands behind the waves (day view)
    const bands: any[] = [];
    if (period === 'day') {
      let start = 0;
      for (let i = 1; i <= pts.length; i++) {
        if (i === pts.length || pts[i].zone !== pts[start].zone) {
          bands.push([{ xAxis: pts[start].label, itemStyle: { color: echarts.color.modifyAlpha(zoneColor(pts[start].zone), 0.07) }, name: `Zone ${pts[start].zone}`, label: { show: true, position: 'insideTop', color: cssVar('--muted'), fontSize: 11, fontWeight: 600 } }, { xAxis: pts[i - 1].label }]);
          start = i;
        }
      }
    }
    return {
      legend: { data: ['Cost (₹)', 'Units (kVAh)', 'MD (kVA)'] },
      grid: { left: 64, right: 118, top: 58, bottom: 36 },
      xAxis: { type: 'category', data: pts.map((p) => p.label), boundaryGap: false, axisLabel: { interval: period === 'day' ? 7 : 'auto' } },
      yAxis: [
        { type: 'value', name: '₹', axisLabel: { formatter: inrAxis } },
        { type: 'value', name: 'kVAh', splitLine: { show: false }, min: 0 },
        // MD on its own scale (to 1.6 × the highest value) so it does not sit exactly on the units wave
        { type: 'value', name: 'kVA', offset: 58, splitLine: { show: false }, min: 0, max: Math.ceil((Math.max(...pts.map((p) => p.mdKva), 1) * 1.6) / 100) * 100 },
      ],
      tooltip: {
        formatter: (ps: any[]) => {
          const p = pts[ps[0].dataIndex];
          return `<b>${p.label}</b>${p.zone ? ` · Zone ${p.zone}` : ''}<br/>`
            + `<span style="color:${cCost}">●</span> Cost ${fmt.inr(p.costInr)}<br/>`
            + `<span style="color:${cUnits}">●</span> ${fmt.n1(p.kvah)} kVAh<br/>`
            + `<span style="color:${cMd}">●</span> ${fmt.n0(p.mdKva)} kVA${period === 'day' && !p.mdCounted ? ' (not counted for MD)' : ''}`;
        },
      },
      series: [
        { ...wave('Cost (₹)', cCost, pts.map((p) => p.costInr)), markArea: bands.length ? { silent: true, data: bands } : undefined },
        wave('Units (kVAh)', cUnits, pts.map((p) => p.kvah), { yAxisIndex: 1, area: false }),
        wave('MD (kVA)', cMd, pts.map((p) => p.mdKva), { yAxisIndex: 2, area: false, lineStyle: { width: 2.2, color: cMd, type: [8, 5] } }),
      ],
    } as any;
  }, [d, period]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Cost, units and MD</h2>
        <div className="seg">
          <button className={period === 'day' ? 'on' : ''} onClick={() => setPeriod('day')}>Today · 15 min</button>
          <button className={period === '7d' ? 'on' : ''} onClick={() => setPeriod('7d')}>7 days</button>
          <button className={period === '30d' ? 'on' : ''} onClick={() => setPeriod('30d')}>30 days</button>
        </div>
      </div>
      {!d ? <Loading error={q.error} /> : !option ? <Empty title="No readings yet">The chart starts with the first 15-minute block after the meters are connected.</Empty> : <Chart option={option} className={height} />}
    </section>
  );
}

function Kpi({ title, when, icon, inr, kvah, kwh, pf, dark }: { title: string; when: string; icon: keyof typeof Icon; inr: number; kvah: number; kwh: number; pf: number | null; dark?: boolean }) {
  const I = Icon[icon];
  return (
    <div className={`card kpi ${dark ? 'dark' : ''}`}>
      <div className="k-top">
        <div><div className="k-title">{title}</div><div className="k-when">{when}</div></div>
        <span className="k-icon"><I size={19} /></span>
      </div>
      <div className="k-main"><span className="cur">₹</span>{fmt.n0(inr)}</div>
      <div className="k-rows">
        <div><span>kVAh (billed units)</span><b>{fmt.n0(kvah)}</b></div>
        <div><span>kWh</span><b>{fmt.n0(kwh)}</b></div>
        <div><span>Average PF</span><b>{fmt.pf(pf)}</b></div>
      </div>
    </div>
  );
}

function MdKpi({ title, when, kva, at, cd, dark }: { title: string; when: string; kva: number; at: string | null; cd: number; dark?: boolean }) {
  return (
    <div className={`card kpi ${dark ? 'dark' : ''}`}>
      <div className="k-top">
        <div><div className="k-title">{title}</div><div className="k-when">{when}</div></div>
        <span className="k-icon"><Icon.gauge size={19} /></span>
      </div>
      <div className="k-main">{fmt.n0(kva)}<small>kVA</small></div>
      <div className="k-rows" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div><span>Recorded at</span><b>{at ?? '–'}</b></div>
        <div><span>Contract demand (set)</span><b>{fmt.n0(cd)} kVA</b></div>
      </div>
    </div>
  );
}

export function RightNow({ ov }: { ov: any }) {
  const blk = useApi<any>('/block', 5000);
  if (!ov) return null;
  const pctCd = ov.md.cdKva ? (ov.live.kva / ov.md.cdKva) * 100 : 0;
  const pfOk = ov.live.pf == null || ov.live.pf >= 0.99;
  const b = blk.data;
  return (
    <section className="card">
      <div className="card-head"><h2>Right now</h2><span className="small muted">{ov.meters.online} of {ov.meters.total} meters sending</span></div>
      <div className="now-tiles">
        <div className="now-tile">
          <div className="h"><Icon.bolt size={15} />Using now</div>
          <div className="v">{fmt.n0(ov.live.kva)} <small>kVA</small></div>
          <div className="s">{Math.round(pctCd)}% of the {fmt.n0(ov.md.cdKva)} kVA contract</div>
          <div className="meter-bar"><i style={{ width: `${Math.min(100, pctCd)}%` }} /></div>
        </div>
        <div className="now-tile">
          <div className="h"><Icon.wave size={15} />Power factor</div>
          <div className="v">{fmt.pf(ov.live.pf)}</div>
          <div className="s"><span className={`chip ${pfOk ? 's-good' : 's-serious'}`}>{pfOk ? 'Good' : 'Low: extra units billed'}</span></div>
        </div>
        <div className="now-tile">
          <div className="h"><Icon.clock size={15} />This 15-minute block</div>
          <div className="v">{b ? `${b.start}–${b.end}` : '–'}</div>
          <div className="s">Zone {ov.zoneNow} · {ov.md.excludedNow ? <b>not counted</b> : <b>counted</b>} in the bill's MD{b?.avgKvaSoFar != null ? ` · ${fmt.n0(b.avgKvaSoFar)} kVA so far` : ''}</div>
        </div>
        <div className="now-tile">
          <div className="h"><Icon.plug size={15} />Power source</div>
          <div className="v" style={{ fontSize: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{ov.live.gridOn ? '✓' : '✕'} Grid {ov.live.gridOn ? 'on' : 'off'}</span>
          </div>
          <div className="s">DG {ov.live.dgKw > 1 ? <b>{fmt.n0(ov.live.dgKw)} kW</b> : 'off'} · Solar {ov.live.solarKw > 0.5 ? <b>{fmt.n0(ov.live.solarKw)} kW</b> : 'off'}</div>
        </div>
      </div>
    </section>
  );
}

function TodayLoad({ ov }: { ov: any }) {
  const option = useMemo(() => {
    if (!ov?.today?.series?.length) return null;
    const now = new Date(ov.now).getTime();
    const s = (ov.today.series as any[]).filter((x) => new Date(x.t).getTime() + 15 * 60_000 <= now);
    if (!s.length) return null;
    const labels = s.map((x) => fmt.time(x.t));
    const pieces: any[] = [];
    s.forEach((x, i) => { const last = pieces[pieces.length - 1]; if (last && last.zone === x.zone) last.lt = i + 1; else pieces.push({ zone: x.zone, gte: i, lt: i + 1, color: zoneColor(x.zone) }); });
    return {
      xAxis: { type: 'category', data: labels, boundaryGap: false, axisLabel: { interval: 7 } },
      yAxis: { type: 'value', name: 'kVA' },
      tooltip: { formatter: (p: any) => `${labels[p[0].dataIndex]} · Zone ${s[p[0].dataIndex].zone}<br/><b>${fmt.n0(p[0].value)} kVA</b>` },
      visualMap: { show: false, dimension: 0, seriesIndex: 0, pieces: pieces.map(({ zone, ...p }) => ({ ...p, lt: p.lt - 0.0001 })) },
      series: [{ ...wave('Load (kVA)', cssVar('--ink'), s.map((x) => x.kva)), areaStyle: { opacity: 0.12 } }],
    } as any;
  }, [ov]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Today's load, every 15 minutes</h2>
        <div className="legend-row">{ov?.zones?.map((z: any) => <span key={z.code}><i style={{ background: zoneColor(z.code) }} />{z.code} {z.label}</span>)}</div>
      </div>
      {option ? <Chart option={option} /> : <Empty title="No finished block yet today" />}
    </section>
  );
}

export default function Overview({ ov }: { ov: any }) {
  const s = useApi<any>('/summary', 30000);
  if (!ov || !s.data) return <Loading error={s.error} />;
  const d = s.data;
  const zoneNow = ov.zones.find((z: any) => z.code === ov.zoneNow);
  const since = d.firstConnected ? `since ${d.firstConnected.slice(0, 10)}` : 'starts at first connection';
  return (
    <div className="stack">
      <div className="page-head">
        <h1>{ov.plantName} <small>· today at a glance</small></h1>
        {zoneNow && <span className="chip" style={{ background: zoneColor(zoneNow.code), color: `var(--zone-${zoneNow.code}-ink)`, fontSize: 14, padding: '8px 16px' }}>Zone {zoneNow.code} · {zoneNow.label} · ₹{zoneNow.unitCost.toFixed(2)} per unit</span>}
      </div>

      <section className="card"><DayRibbon zones={ov.zones} minuteOfDay={ov.minuteOfDay} /></section>

      <div className="grid g3">
        <Kpi title="Today" when="Since 00:00" icon="clock" inr={d.today.inr} kvah={d.today.kvah} kwh={d.today.kwh} pf={d.today.pf} dark />
        <Kpi title="This month" when="Bill so far" icon="cal" inr={d.month.inr} kvah={d.month.kvah} kwh={d.month.kwh} pf={d.month.pf} />
        <Kpi title="Total" when={since} icon="bill" inr={d.total.inr} kvah={d.total.kvah} kwh={d.total.kwh} pf={d.total.pf} />
        <MdKpi title="Today's MD" when="Highest 15-min block today" kva={d.mdToday.kva} at={d.mdToday.at} cd={d.cdKva} dark />
        <MdKpi title="This month's MD" when="Billed as recorded MD" kva={d.mdMonth.kva} at={d.mdMonth.at} cd={d.cdKva} />
        <MdKpi title="Highest MD" when={since} kva={d.mdHighest.kva} at={d.mdHighest.at} cd={d.cdKva} />
      </div>

      <RightNow ov={ov} />
      <ThreeWave />
      <TodayLoad ov={ov} />
    </div>
  );
}
