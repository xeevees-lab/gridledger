import { useCallback, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

// ---------------------------------------------------------------- API
export class ApiError extends Error {
  constructor(public status: number, message: string, public data: any = null) { super(message); }
}

/** Reason and electronic signature for a change (21 CFR Part 11). Sent as base64 headers, never in the URL. */
export type ChangeAuth = { reason?: string; password?: string; username?: string };
const b64 = (s: string) => { const b = new TextEncoder().encode(s); let x = ''; b.forEach((c) => (x += String.fromCharCode(c))); return btoa(x); };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; change?: ChangeAuth } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers['content-type'] = 'application/json';
  if (opts.change?.reason) headers['X-GL-Reason'] = b64(opts.change.reason);
  if (opts.change?.password) headers['X-GL-Sign-Password'] = b64(opts.change.password);
  if (opts.change?.username) headers['X-GL-Sign-User'] = b64(opts.change.username);
  const r = await fetch('/api' + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (r.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) {
    window.dispatchEvent(new Event('gl-logout'));
  }
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new ApiError(r.status, data?.error ?? data?.title ?? `Request failed (${r.status})`, data);
  return data as T;
}

/** Loads data and refreshes it every `everyMs` (0 = no refresh). */
export function useApi<T = any>(path: string | null, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    load();
    if (!everyMs) return;
    const t = setInterval(load, everyMs);
    return () => clearInterval(t);
  }, [load, everyMs]);
  return { data, error, loading, reload: load };
}

// ---------------------------------------------------------------- formatting (Indian style)
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const fmt = {
  inr: (v?: number | null) => (v == null ? '–' : Math.round(v) === 0 ? '₹0' : (v < 0 ? '−₹' : '₹') + inr0.format(Math.abs(Math.round(v)))),
  /** ₹12.4 lakh / ₹1.2 crore for big money */
  inrShort: (v?: number | null) => {
    if (v == null) return '–';
    const a = Math.abs(v);
    if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} crore`;
    if (a >= 1e5) return `₹${(v / 1e5).toFixed(a >= 1e6 ? 1 : 2)} lakh`;
    return '₹' + inr0.format(Math.round(v));
  },
  n0: (v?: number | null) => (v == null ? '–' : inr0.format(Math.round(v))),
  n1: (v?: number | null) => (v == null ? '–' : n1.format(v)),
  pf: (v?: number | null) => (v == null ? '–' : v.toFixed(3)),
  pct: (v?: number | null, d = 1) => (v == null ? '–' : `${v.toFixed(d)}%`),
  time: (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '–'),
  dateTime: (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '–',
  date: (iso?: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '–'),
  month: (iso?: string | null) => (iso ? new Date(iso.slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '–'),
  ago: (iso?: string | null) => {
    if (!iso) return 'never';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return `${Math.max(1, Math.round(s))} s ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
  },
  hhmm: (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
};

// ---------------------------------------------------------------- colours from CSS tokens (charts follow light/dark)
/** Rupee axis labels in one unit: lakh (L) from ₹10,000 up, so a chart never mixes "90k" and "1.2L". */
export const inrAxis = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e4 ? `${+(v / 1e5).toFixed(2)}L` : fmt.n0(v));

/** Colours for many series (meters in a pie): the brand palette first, then lighter and darker steps. */
export const palette = () => [cssVar('--accent'), cssVar('--blue'), cssVar('--ink'), cssVar('--zone-C'), cssVar('--zone-A'), '#e9a58f', '#b7c0fa', '#8f8b85', '#d98c3f', '#7b8a6a', '#c9b8e8', '#5e5a55'];

/** A smooth "wave" line with a soft fill under it. */
export function wave(name: string, color: string, data: any[], o: Record<string, any> = {}) {
  const { area = true, showSymbol = data.length <= 2, ...rest } = o;
  return {
    name, type: 'line', data, smooth: 0.45, showSymbol, symbol: 'circle', symbolSize: 9, connectNulls: false,
    lineStyle: { width: 2.8, color, cap: 'round' }, itemStyle: { color, borderColor: cssVar('--surface'), borderWidth: 2 },
    areaStyle: area ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: echarts.color.modifyAlpha(color, 0.16) }, { offset: 1, color: echarts.color.modifyAlpha(color, 0) }]) } : undefined,
    emphasis: { focus: 'series' },
    ...rest,
  };
}

/** A flat reference line drawn as its own series (target, limit, contract), so it shows in the legend and tooltip. */
export function refLine(name: string, color: string, value: number | null | undefined, n: number, o: Record<string, any> = {}) {
  return {
    name, type: 'line', symbol: 'none', data: Array(n).fill(value ?? null), lineStyle: { width: 1.5, type: [6, 6], color }, itemStyle: { color },
    emphasis: { disabled: true }, z: 1, ...o,
  };
}

/** Doughnut chart option for shares (zones, meters). */
export function pieOption(items: { name: string; value: number; color?: string }[], unit: string) {
  const total = items.reduce((s, x) => s + (x.value || 0), 0);
  const pal = palette();
  return {
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.marker}${p.name}<br/><b>${fmt.n0(p.value)} ${unit}</b> (${p.percent.toFixed(1)}%)` },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle', icon: 'circle', itemWidth: 10, itemHeight: 10, formatter: (n: string) => { const x = items.find((i) => i.name === n); return `${n}  ${total ? ((100 * (x?.value ?? 0)) / total).toFixed(1) : 0}%`; } },
    xAxis: undefined, yAxis: undefined,
    series: [{
      type: 'pie', radius: ['48%', '76%'], center: ['34%', '52%'], avoidLabelOverlap: true, padAngle: 1.5,
      itemStyle: { borderRadius: 10, borderColor: cssVar('--surface'), borderWidth: 3 },
      label: { show: true, position: 'inside', formatter: (p: any) => (p.percent >= 6 ? `${Math.round(p.percent)}%` : ''), color: '#fff', fontWeight: 600, fontSize: 11 },
      labelLine: { show: false },
      data: items.map((x, i) => ({ name: x.name, value: Math.round(x.value), itemStyle: { color: x.color ?? pal[i % pal.length] } })),
    }],
  } as any;
}

export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export const zoneColor = (code: string) => cssVar(`--zone-${code}`) || cssVar('--chart-1');

// ---------------------------------------------------------------- ECharts wrapper
export function Chart({ option, className = 'chart', onClick }: { option: echarts.EChartsOption; className?: string; onClick?: (p: any) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); inst.current?.dispose(); };
  }, []);
  useEffect(() => {
    inst.current?.setOption(withDefaults(option), true);
    const re = () => inst.current?.setOption(withDefaults(option), true);
    window.addEventListener('gl-theme', re);
    return () => window.removeEventListener('gl-theme', re);
  }, [option]);
  useEffect(() => {
    if (!onClick || !inst.current) return;
    inst.current.on('click', onClick);
    return () => { inst.current?.off('click', onClick); };
  }, [onClick]);
  return <div ref={ref} className={className} />;
}

function withDefaults(o: echarts.EChartsOption): echarts.EChartsOption {
  const ink2 = cssVar('--ink-2'), grid = cssVar('--chart-grid'), axis = cssVar('--chart-axis'), surface = cssVar('--surface'), ink = cssVar('--ink');
  const ax = (a: any) => (Array.isArray(a) ? a : a ? [a] : []).map((x: any) => ({
    axisLine: { show: false, lineStyle: { color: axis } }, axisTick: { show: false },
    axisLabel: { color: ink2, fontSize: 12, hideOverlap: true, ...(x.axisLabel ?? {}) },
    splitLine: { lineStyle: { color: grid, width: 1, type: [2, 5] }, ...(x.splitLine ?? {}) },
    nameTextStyle: { color: ink2, fontSize: 12 },
    ...x,
  }));
  return {
    textStyle: { fontFamily: '"Inter Variable", Inter, "Segoe UI", system-ui, sans-serif' },
    grid: { left: 56, right: Array.isArray(o.yAxis) && o.yAxis.length > 1 ? 60 : 20, top: o.legend ? 58 : 30, bottom: 36, ...(o.grid as any) },
    tooltip: {
      trigger: 'axis', backgroundColor: surface, borderWidth: 0, padding: [10, 14],
      extraCssText: 'border-radius:16px;box-shadow:0 10px 30px rgba(40,25,10,.14);',
      textStyle: { color: ink, fontSize: 13 },
      axisPointer: { type: 'line', lineStyle: { color: axis, type: [3, 4] } },
      ...(o.tooltip as any),
    },
    legend: o.legend ? { type: 'scroll', textStyle: { color: ink2, fontSize: 13 }, top: 0, left: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 18, pageIconSize: 10, pageTextStyle: { color: ink2 }, ...(o.legend as any) } : undefined,
    animationDuration: 300,
    ...o,
    xAxis: (o.xAxis === undefined && 'series' in o && (o.series as any[])?.every?.((x: any) => x.type === 'pie') ? undefined : ax(o.xAxis)) as any,
    yAxis: (o.yAxis === undefined && 'series' in o && (o.series as any[])?.every?.((x: any) => x.type === 'pie') ? undefined : ax(o.yAxis)) as any,
  };
}

// ---------------------------------------------------------------- icons (inline, no external files)
const P = (d: string) => (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split('|').map((x, i) => <path key={i} d={x} />)}
  </svg>
);
export const Icon = {
  home: P('M3 11 12 3l9 8|M5 10v10h14V10'),
  trend: P('M3 17l6-6 4 4 8-8|M14 7h7v7'),
  rupee: P('M6 4h12|M6 9h12|M14 20 6 13h3a5 5 0 0 0 0-9'),
  bell: P('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10 21a2 2 0 0 0 4 0'),
  bill: P('M6 3h12v18l-3-2-3 2-3-2-3 2z|M9 8h6|M9 12h6'),
  gauge: P('M12 14 16 9|M3.5 17a9 9 0 1 1 17 0'),
  clock: P('M12 7v5l3 3|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'),
  wave: P('M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0 '),
  plug: P('M9 2v6|M15 2v6|M6 8h12v4a6 6 0 0 1-12 0z|M12 18v4'),
  meter: P('M4 4h16v16H4z|M8 15l3-5 3 3 2-4'),
  gear: P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
  bolt: P('M13 2 4 14h7l-1 8 9-12h-7z'),
  sun: P('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4'),
  fuel: P('M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17|M3 22h12|M15 9h2a2 2 0 0 1 2 2v6a1 1 0 0 0 2 0V8l-3-3|M6 8h6'),
  alert: P('M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'),
  octagon: P('M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z|M12 8v4|M12 16h.01'),
  eye: P('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
  info: P('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01'),
  check: P('M20 6 9 17l-5-5'),
  menu: P('M4 8h16|M4 16h10'),
  x: P('M18 6 6 18|M6 6l12 12'),
  arrow: P('M5 12h14|M13 6l6 6-6 6'),
  back: P('M19 12H5|M11 6l-6 6 6 6'),
  cal: P('M4 6h16v14H4z|M8 3v5|M16 3v5|M4 11h16'),
  user: P('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0'),
  list: P('M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01'),
  print: P('M6 9V3h12v6|M6 18H4v-7h16v7h-2|M8 14h8v7H8z'),
  download: P('M12 3v12|M7 10l5 5 5-5|M5 21h14'),
  logout: P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9'),
  moon: P('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
  search: P('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3'),
  shield: P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4'),
  pen: P('M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'),
  snow: P('M12 2v20|M4.9 4.9l14.2 14.2|M2 12h20|M4.9 19.1 19.1 4.9|M9 4l3 2 3-2|M9 20l3-2 3 2'),
};

export const SEVERITY: Record<string, { label: string; cls: string; icon: keyof typeof Icon }> = {
  critical: { label: 'Act now', cls: 's-critical', icon: 'octagon' },
  serious: { label: 'Needs attention', cls: 's-serious', icon: 'alert' },
  watch: { label: 'Watch', cls: 's-watch', icon: 'eye' },
  info: { label: 'For your information', cls: 's-info', icon: 'info' },
};

export function SevChip({ sev }: { sev: string }) {
  const s = SEVERITY[sev] ?? SEVERITY.info;
  const I = Icon[s.icon];
  return <span className={`chip ${s.cls}`}><I size={13} />{s.label}</span>;
}

export function Loading({ error }: { error?: string | null }) {
  if (error) return <div className="error-box">Could not load this page: {error}</div>;
  return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
}
