import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, fmt, Loading, useApi } from '../lib';
import { Empty } from '../components/common';
import { ROLE, StatusChip, TAG } from './Meters';
import { isCancel, ROLE_HELP, ROLE_NAME, useMe, type Me } from '../components/sign';

export default function Settings({ me }: { me: Me }) {
  const can = (p: string) => me.perms.includes(p);
  const tabs: [string, string, boolean][] = [
    ['meters', 'Meters', can('configure')], ['plant', 'Plant', can('configure')], ['tariff', 'Tariff', can('configure')],
    ['notify', 'Notifications', can('configure')], ['users', 'Users', can('users')], ['compliance', '21 CFR Part 11', can('compliance')],
  ];
  const shown = tabs.filter((t) => t[2]);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Settings</h1><p>Everything the AI uses is set here. Every change needs a reason{me.policy?.signConfigChanges ? ' and your electronic signature' : ''}, and is kept in the audit trail.</p></div></div>
      <nav className="tabs">{shown.map(([k, l]) => <NavLink key={k} to={`/settings/${k}`} className={({ isActive }) => (isActive ? 'on' : '')}>{l}</NavLink>)}</nav>
      <Routes>
        {can('configure') && <>
          <Route path="meters" element={<MetersTab />} />
          <Route path="plant" element={<PlantTab />} />
          <Route path="tariff" element={<TariffTab />} />
          <Route path="bills" element={<Navigate to="/settings/meters" />} />
          <Route path="notify" element={<NotifyTab />} />
        </>}
        {can('users') && <Route path="users" element={<UsersTab me={me} />} />}
        {can('compliance') && <Route path="compliance" element={<ComplianceTab />} />}
        <Route path="*" element={<Navigate to={shown[0]?.[0] ?? '/'} />} />
      </Routes>
    </div>
  );
}

// ---------------------------------------------------------------- shared helpers
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}
function Num({ value, onChange, step = 'any', min }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: string; min?: number }) {
  return <input className="input num" type="number" step={step} min={min} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
}
function Txt({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
function useSettings() {
  const q = useApi<any>('/settings');
  const { signed } = useMe();
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data) setS(structuredClone(q.data)); }, [q.data]);
  const save = async () => {
    try { await signed((c) => api('/settings', { method: 'PUT', body: s, change: c })); setMsg({ ok: true, text: 'Saved and recorded in the audit trail. The AI uses the new values from now on.' }); q.reload(); }
    catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); }
  };
  return { s, setS, save, msg, error: q.error };
}
const set = (obj: any, path: string, v: any) => { const c = structuredClone(obj); const ks = path.split('.'); let o = c; ks.slice(0, -1).forEach((k) => (o = o[k])); o[ks[ks.length - 1]] = v; return c; };

// ---------------------------------------------------------------- meters
const BLANK = { id: 0, name: '', area: '', role: 'load', tag: 'critical', priority: 5, template: 'schneider-pm1130h', port: '', baud: 19200, parity: 'even', dataBits: 8, stopBits: 1, unitId: 1, host: '', tcpPort: 502, ctPrimary: 5, ctSecondary: 5, ptPrimary: 1, ptSecondary: 1, scaledInMeter: true, ratedKva: null, tankCapacityL: null, minRunMin: 60, allowFrom: '', allowTo: '', enabled: true, pollMs: 5000 };

function MetersTab() {
  const list = useApi<any[]>('/meters', 5000);
  const [edit, setEdit] = useState<any>(null);
  return (
    <div className="stack">
      <ScanCard onUse={(f) => {
        const net = !f.baud;
        const [h, p] = net ? [f.port.slice(0, f.port.lastIndexOf(':')), Number(f.port.slice(f.port.lastIndexOf(':') + 1)) || 502] : ['', 502];
        setEdit({ ...BLANK, port: net ? '' : f.port, host: h, tcpPort: p, baud: net ? BLANK.baud : f.baud, parity: net ? BLANK.parity : f.parity, unitId: f.unitId, template: f.template, name: `Meter ${f.unitId}` });
      }} />
      <section className="card">
        <div className="card-head"><h2>Configured meters</h2><button className="btn primary" onClick={() => setEdit({ ...BLANK })}>Add meter</button></div>
        {!list.data ? <Loading error={list.error} /> : list.data.length === 0 ? <Empty title="No meters yet">Plug in the converter and use the search above, or press Add meter.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Type</th><th>Model</th><th>Connection</th><th className="r">MF</th><th>Status</th><th /></tr></thead>
              <tbody>{list.data.map((m) => (
                <tr key={m.meter.id}>
                  <td><b>{m.meter.name}</b><div className="tiny muted">{m.meter.area}</div></td>
                  <td className="small">{ROLE[m.meter.role]}{m.meter.role === 'load' ? `, ${TAG[m.meter.tag].toLowerCase()}` : ''}</td>
                  <td className="small">{m.templateName}{!m.templateVerified && <div className="tiny muted">register list to confirm on site</div>}</td>
                  <td className="small">{m.meter.host ? `TCP ${m.meter.host}:${m.meter.tcpPort}` : `${m.meter.port}, ID ${m.meter.unitId}, ${m.meter.baud} ${m.meter.parity}`}</td>
                  <td className="r">{m.mf}</td>
                  <td><StatusChip s={m.status} /></td>
                  <td><button className="btn sm" onClick={() => setEdit({ ...m.meter })}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {edit && <MeterEditor key={JSON.stringify(edit)} m={edit} onClose={() => { setEdit(null); list.reload(); }} />}
    </div>
  );
}

function ScanCard({ onUse }: { onUse: (f: any) => void }) {
  const ports = useApi<string[]>('/ports', 5000);
  const [mode, setMode] = useState<'com' | 'net'>('com');
  const [port, setPort] = useState('');
  const [ip, setIp] = useState('');
  const [st, setSt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const target = mode === 'com' ? port : ip.trim();
  useEffect(() => { if (!port && ports.data?.length) setPort(ports.data[0]); }, [ports.data, port]);
  useEffect(() => {
    if (!st?.scanning || !target) return;
    const t = setInterval(async () => { try { setSt(await api(`/scan?port=${encodeURIComponent(target)}`)); } catch { /* keep trying */ } }, 1000);
    return () => clearInterval(t);
  }, [st?.scanning, target]);
  const start = async (full: boolean) => {
    setErr(null);
    if (mode === 'net' && !/^[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(target)) { setErr('Enter the IP address of the meter or gateway, e.g. 192.168.1.50 (or 192.168.1.50:502).'); return; }
    try { await api('/scan', { body: { port: target, full } }); setSt({ scanning: true, progress: 'Starting…', found: [] }); }
    catch (e: any) { setErr(e.message); }
  };
  const busy = !!st?.scanning;
  return (
    <section className="card">
      <div className="card-head"><div><h2>Find meters automatically</h2><p>RS485: plug the USB-RS485 converter into this PC (new converters are searched by themselves). Network: enter the IP address of the meter or RS485-to-Ethernet gateway.</p></div></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="seg"><button className={mode === 'com' ? 'on' : ''} onClick={() => { setMode('com'); setSt(null); setErr(null); }}>RS485 (USB)</button><button className={mode === 'net' ? 'on' : ''} onClick={() => { setMode('net'); setSt(null); setErr(null); }}>Network (Modbus TCP)</button></div>
      </div>
      {mode === 'com' && ports.data?.length === 0 ? <div className="note-box">No COM port found. Plug in the USB-RS485 converter (install its driver if Windows asks), then wait a few seconds.</div> : (
        <div className="row">
          {mode === 'com'
            ? <select className="input" style={{ width: 160 }} value={port} onChange={(e) => { setPort(e.target.value); setSt(null); }} aria-label="COM port">{ports.data?.map((p) => <option key={p}>{p}</option>)}</select>
            : <input className="input" style={{ width: 220 }} value={ip} onChange={(e) => { setIp(e.target.value); setSt(null); }} placeholder="192.168.1.50" aria-label="IP address" />}
          <button className="btn primary" disabled={!target || busy} onClick={() => start(false)}>Quick search (IDs 1–10)</button>
          <button className="btn" disabled={!target || busy} onClick={() => start(true)}>Full search (IDs 1–247, slow)</button>
          {st && <span className="small ink2">{st.progress}</span>}
        </div>
      )}
      {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      {st?.found?.length > 0 && (
        <table className="t" style={{ marginTop: 12 }}>
          <thead><tr><th>Found</th><th>{mode === 'com' ? 'Port' : 'Address'}</th><th>ID</th><th>Speed</th><th>Test value</th><th /></tr></thead>
          <tbody>{st.found.map((f: any) => (
            <tr key={f.port + f.unitId}><td>{f.templateName}</td><td>{f.port}</td><td>{f.unitId}</td><td>{f.baud ? `${f.baud} baud, ${f.parity} parity` : 'Network'}</td><td>{f.probeValue ?? '–'}</td><td><button className="btn primary sm" onClick={() => onUse(f)}>Add</button></td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function MeterEditor({ m: init, onClose }: { m: any; onClose: () => void }) {
  const [m, setM] = useState<any>(init);
  const tpl = useApi<any[]>('/templates');
  const ports = useApi<string[]>('/ports');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<any>(null);
  const [tcp, setTcp] = useState(!!init.host);
  const u = (k: string, v: any) => setM({ ...m, [k]: v });
  const mf = (m.scaledInMeter ? 1 : (m.ctPrimary / m.ctSecondary) * (m.ptPrimary / m.ptSecondary));
  const { signed } = useMe();
  const body = () => ({ ...m, host: tcp ? m.host : '', port: tcp ? '' : m.port });
  const save = async () => {
    try { await signed((c) => api('/meters', { body: body(), change: c })); onClose(); } catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); }
  };
  const remove = async () => {
    if (!confirm(`Remove ${m.name}? Its recorded history is kept.`)) return;
    try { await signed((c) => api(`/meters/${m.id}`, { method: 'DELETE', change: c })); onClose(); } catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); }
  };
  const runTest = async () => {
    setTest(null); setMsg(null);
    try { setTest(await api('/meters/test', { body: body() })); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const chosen = tpl.data?.find((t) => t.id === m.template);
  return (
    <section className="card">
      <div className="card-head"><h2>{m.id ? `Edit ${init.name}` : 'Add a meter'}</h2><button className="btn ghost sm" onClick={onClose}>Close</button></div>
      <div className="stack">
        <h3>What it measures</h3>
        <div className="form-grid">
          <Field label="Name"><Txt value={m.name} onChange={(v) => u('name', v)} placeholder="e.g. Air compressor 2" /></Field>
          <Field label="Area"><Txt value={m.area} onChange={(v) => u('area', v)} placeholder="e.g. Utilities" /></Field>
          <Field label="What is this meter on?" hint="Grid incomer = the plant's main supply from MSEB">
            <select className="input" value={m.role} onChange={(e) => {
              const role = e.target.value;
              const tplId = role === 'chiller' ? 'generic-equipment-controller' : role === 'fuel' ? 'generic-fuel-level' : m.template;
              const t = tpl.data?.find((x) => x.id === tplId);
              setM({ ...m, role, template: tplId, ...(t?.defaults && !m.id ? { baud: t.defaults.baud, parity: t.defaults.parity, unitId: t.defaults.unitId } : {}) });
            }}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          {m.role === 'load' && (
            <Field label="Can the AI suggest changes?" hint="Can move = may run at another time of day. Can pause = may stop for a few minutes at peak.">
              <select className="input" value={m.tag} onChange={(e) => u('tag', e.target.value)}>{Object.entries(TAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
          )}
          {m.role === 'load' && m.tag !== 'critical' && <Field label="Order to stop (1 = first)"><Num value={m.priority} onChange={(v) => u('priority', v ?? 5)} min={1} /></Field>}
          {m.role === 'chiller' ? <Field label="Equipment controller" hint="Reads Alarm Present, Shutdown Alarm Present, Last Diagnostic and Unit kW. Read-only: GridLedger never writes to the controller. Not counted in energy totals."><div className="input" style={{ background: 'var(--surface-2)' }}>Status and alarms only</div></Field>
          : m.role === 'fuel'
            ? <Field label="Tank size (litres)" hint="Needed to show % full and low-fuel alerts"><Num value={m.tankCapacityL} onChange={(v) => u('tankCapacityL', v)} /></Field>
            : <Field label="Rated size (kVA)" hint="Optional; helps spot problems"><Num value={m.ratedKva} onChange={(v) => u('ratedKva', v)} /></Field>}
          {m.tag === 'shiftable' && <>
            <Field label="Shortest run (minutes)" hint="The plan never runs it for less"><Num value={m.minRunMin} onChange={(v) => u('minRunMin', v ?? 60)} min={15} /></Field>
            <Field label="May run from" hint="Leave empty = working hours"><Txt type="time" value={m.allowFrom} onChange={(v) => u('allowFrom', v)} /></Field>
            <Field label="May run until"><Txt type="time" value={m.allowTo} onChange={(v) => u('allowTo', v)} /></Field>
          </>}
        </div>
        <h3>Connection</h3>
        <div className="form-grid">
          <Field label="Meter model" hint={chosen?.note}>
            <select className="input" value={m.template} onChange={(e) => { const t = tpl.data?.find((x) => x.id === e.target.value); setM({ ...m, template: e.target.value, ...(t?.defaults && !m.id ? { baud: t.defaults.baud, parity: t.defaults.parity, unitId: t.defaults.unitId } : {}) }); }}>
              {tpl.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Connected by"><div className="seg"><button className={!tcp ? 'on' : ''} onClick={() => setTcp(false)}>RS485 (USB)</button><button className={tcp ? 'on' : ''} onClick={() => setTcp(true)}>Network (Modbus TCP)</button></div></Field>
          {!tcp ? <>
            <Field label="COM port"><select className="input" value={m.port} onChange={(e) => u('port', e.target.value)}><option value="">Choose…</option>{[...new Set([...(ports.data ?? []), m.port].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Modbus ID (slave ID)" hint="Shown in the meter's communication menu"><Num value={m.unitId} onChange={(v) => u('unitId', v ?? 1)} min={1} /></Field>
            <Field label="Baud rate"><select className="input" value={m.baud} onChange={(e) => u('baud', Number(e.target.value))}>{[4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Parity"><select className="input" value={m.parity} onChange={(e) => u('parity', e.target.value)}><option value="even">Even</option><option value="none">None</option><option value="odd">Odd</option></select></Field>
            <Field label="Stop bits"><select className="input" value={m.stopBits} onChange={(e) => u('stopBits', Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select></Field>
          </> : <>
            <Field label="IP address"><Txt value={m.host} onChange={(v) => u('host', v)} placeholder="192.168.1.50" /></Field>
            <Field label="TCP port"><Num value={m.tcpPort} onChange={(v) => u('tcpPort', v ?? 502)} /></Field>
            <Field label="Modbus ID"><Num value={m.unitId} onChange={(v) => u('unitId', v ?? 1)} min={1} /></Field>
          </>}
          <Field label="Read every (seconds)"><Num value={m.pollMs / 1000} onChange={(v) => u('pollMs', Math.round((v ?? 5) * 1000))} min={1} /></Field>
          <Field label="Recording"><select className="input" value={m.enabled ? 'on' : 'off'} onChange={(e) => u('enabled', e.target.value === 'on')}><option value="on">On</option><option value="off">Off</option></select></Field>
        </div>
        {!['chiller', 'fuel'].includes(m.role) && <h3>CT / PT ratio (multiplying factor)</h3>}
        <div className="form-grid" style={['chiller', 'fuel'].includes(m.role) ? { display: 'none' } : undefined}>
          <Field label="Is the CT/PT ratio already set inside the meter?" hint="Yes for most modern meters: they show real (primary) values">
            <select className="input" value={m.scaledInMeter ? 'yes' : 'no'} onChange={(e) => u('scaledInMeter', e.target.value === 'yes')}><option value="yes">Yes, the meter shows real values</option><option value="no">No, multiply here</option></select>
          </Field>
          {!m.scaledInMeter && <>
            <Field label="CT primary (A)"><Num value={m.ctPrimary} onChange={(v) => u('ctPrimary', v ?? 5)} /></Field>
            <Field label="CT secondary (A)"><Num value={m.ctSecondary} onChange={(v) => u('ctSecondary', v ?? 5)} /></Field>
            <Field label="PT primary (V)"><Num value={m.ptPrimary} onChange={(v) => u('ptPrimary', v ?? 1)} /></Field>
            <Field label="PT secondary (V)"><Num value={m.ptSecondary} onChange={(v) => u('ptSecondary', v ?? 1)} /></Field>
          </>}
          <Field label="Multiplying factor (MF)"><div className="input num" style={{ background: 'var(--surface-2)' }}>{fmt.n1(mf)}</div></Field>
        </div>
        {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
        {test && (
          <div className="note-box">
            <b>Meter answered.</b> Compare these with the meter's own display. If a value looks wrong, the register list for this model needs a correction.
            <table className="t" style={{ marginTop: 8 }}><tbody>{Object.entries(test.values).map(([k, v]: any) => <tr key={k}><td>{k}</td><td className="r">{v == null ? 'not read' : fmt.n1(v)}</td></tr>)}</tbody></table>
          </div>
        )}
        <div className="row">
          <button className="btn primary" onClick={save}>Save meter</button>
          <button className="btn" onClick={runTest} disabled={m.template === 'test-feed'}>Test connection</button>
          {m.id > 0 && <button className="btn danger" onClick={remove}>Remove</button>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- plant
function PlantTab() {
  const { s, setS, save, msg, error } = useSettings();
  if (!s) return <Loading error={error} />;
  const p = s.plant;
  const u = (k: string, v: any) => setS(set(s, k, v));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div className="stack">
      <section className="card stack">
        <h2>Plant and contract</h2>
        <div className="form-grid">
          <Field label="Plant name"><Txt value={p.name} onChange={(v) => u('plant.name', v)} /></Field>
          <Field label="Contract demand (kVA)" hint="From your MSEDCL bill"><Num value={p.contractDemandKva} onChange={(v) => u('plant.contractDemandKva', v)} /></Field>
          <Field label="Your own MD limit (kVA)" hint="Empty = the minimum billed (75% of contract demand)"><Num value={p.mdTargetKva} onChange={(v) => u('plant.mdTargetKva', v)} /></Field>
          <Field label="MD block length" hint="As set in the MSEDCL meter; usually 15 minutes"><select className="input" value={p.mdBlockMin} onChange={(e) => u('plant.mdBlockMin', Number(e.target.value))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></Field>
          <Field label="Safety margin for contract demand advice (%)"><Num value={p.cdSafetyMarginPct} onChange={(v) => u('plant.cdSafetyMarginPct', v)} /></Field>
          <Field label="Losses between MSEDCL meter and ours (%)" hint="e.g. HT transformer losses; the AI suggests a value after a bill check"><Num value={p.lossPct} onChange={(v) => u('plant.lossPct', v ?? 0)} /></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>Working hours</h2>
        <p className="small ink2">The AI only suggests running machines inside these hours, so it never asks for night work you do not do.</p>
        <div className="form-grid">
          <Field label="Work starts"><Txt type="time" value={p.workStart} onChange={(v) => u('plant.workStart', v)} /></Field>
          <Field label="Work ends"><Txt type="time" value={p.workEnd} onChange={(v) => u('plant.workEnd', v)} /></Field>
          <Field label="Working days">
            <div className="seg">{days.map((d, i) => <button key={d} className={p.workDays.includes(i) ? 'on' : ''} onClick={() => u('plant.workDays', p.workDays.includes(i) ? p.workDays.filter((x: number) => x !== i) : [...p.workDays, i].sort())}>{d}</button>)}</div>
          </Field>
          <Field label="Holidays" hint="Dates, separated by commas (YYYY-MM-DD)"><Txt value={p.holidays.join(', ')} onChange={(v) => u('plant.holidays', v.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>Alert limits and targets</h2>
        <div className="form-grid">
          <Field label="Power factor target"><Num value={p.pfTarget} onChange={(v) => u('plant.pfTarget', v)} /></Field>
          <Field label="Power factor alarm below"><Num value={p.pfAlarm} onChange={(v) => u('plant.pfAlarm', v)} /></Field>
          <Field label="Voltage unbalance: watch above (%)"><Num value={p.voltUnbWarnPct} onChange={(v) => u('plant.voltUnbWarnPct', v)} /></Field>
          <Field label="Voltage unbalance: serious above (%)"><Num value={p.voltUnbCritPct} onChange={(v) => u('plant.voltUnbCritPct', v)} /></Field>
          <Field label="Voltage THD limit (%)"><Num value={p.thdVLimitPct} onChange={(v) => u('plant.thdVLimitPct', v)} /></Field>
          <Field label="Current THD limit (%)"><Num value={p.thdILimitPct} onChange={(v) => u('plant.thdILimitPct', v)} /></Field>
          <Field label="Daily target (kVAh)" hint="Optional"><Num value={p.dailyTargetKvah} onChange={(v) => u('plant.dailyTargetKvah', v)} /></Field>
          <Field label="Daily target (₹)" hint="Optional"><Num value={p.dailyTargetInr} onChange={(v) => u('plant.dailyTargetInr', v)} /></Field>
          <Field label="Nominal voltage, phase to neutral (V)"><Num value={p.nominalVoltageLN} onChange={(v) => u('plant.nominalVoltageLN', v)} /></Field>
          <Field label="Common-area bill shared by"><select className="input" value={p.commonSplit} onChange={(e) => u('plant.commonSplit', e.target.value)}><option value="energy">Each area's use</option><option value="equal">Equally</option></select></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>DG set and solar</h2>
        <div className="form-grid">
          <Field label="Diesel price (₹ per litre)"><Num value={s.dg.fuelPricePerL} onChange={(v) => u('dg.fuelPricePerL', v)} /></Field>
          <Field label="Diesel used per unit (litres per kWh)" hint="Typical 0.25–0.30; check your DG log"><Num value={s.dg.litresPerKwh} onChange={(v) => u('dg.litresPerKwh', v)} /></Field>
          <Field label="DG rating (kVA)"><Num value={s.dg.ratedKva} onChange={(v) => u('dg.ratedKva', v)} /></Field>
          <Field label="DG low-load warning below (%)"><Num value={s.dg.lowLoadPct} onChange={(v) => u('dg.lowLoadPct', v)} /></Field>
          <Field label="Low diesel warning below (% of tank)" hint="Needs a fuel level sensor (meter type 'DG fuel tank sensor')"><Num value={s.dg.fuelWarnPct} onChange={(v) => u('dg.fuelWarnPct', v)} /></Field>
          <Field label="Low diesel serious below (% of tank)"><Num value={s.dg.fuelCritPct} onChange={(v) => u('dg.fuelCritPct', v)} /></Field>
          <Field label="Solar size (kWp)"><Num value={s.solar.capacityKwp} onChange={(v) => u('solar.capacityKwp', v)} /></Field>
          <Field label="Expected solar per kWp per day (kWh)" hint="About 4 in Maharashtra"><Num value={s.solar.expectedKwhPerKwpDay} onChange={(v) => u('solar.expectedKwhPerKwpDay', v)} /></Field>
        </div>
      </section>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
      <div><button className="btn primary" onClick={save}>Save changes</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- tariff
function TariffTab() {
  const { s, setS, save, msg, error } = useSettings();
  if (!s) return <Loading error={error} />;
  const t = s.tariff;
  const u = (k: string, v: any) => setS(set(s, k, v));
  return (
    <div className="stack">
      <div className="note-box">Defaults were read from your MSEDCL HT-I A bill (tariff from 1 April 2026). When MSEDCL changes rates, update them here. Lines marked "check" could not be confirmed from public documents: compare them with your next bill.</div>
      <section className="card stack">
        <h2>Rates</h2>
        <div className="form-grid">
          <Field label="Tariff name"><Txt value={t.name} onChange={(v) => u('tariff.name', v)} /></Field>
          <Field label="Demand charge (₹ per kVA per month)"><Num value={t.demandRate} onChange={(v) => u('tariff.demandRate', v)} /></Field>
          <Field label="Energy charge (₹ per kVAh)"><Num value={t.energyRate} onChange={(v) => u('tariff.energyRate', v)} /></Field>
          <Field label="Wheeling charge (₹ per kVAh)"><Num value={t.wheelingRate} onChange={(v) => u('tariff.wheelingRate', v)} /></Field>
          <Field label="FAC (₹ per kVAh)"><Num value={t.facRate} onChange={(v) => u('tariff.facRate', v)} /></Field>
          <Field label="Electricity duty (%)"><Num value={t.edPct} onChange={(v) => u('tariff.edPct', v)} /></Field>
          <Field label="Tax on sale (₹ per unit)"><Num value={t.taxOnSaleRate} onChange={(v) => u('tariff.taxOnSaleRate', v)} /></Field>
          <Field label="Excess demand multiplier (check)" hint="Demand above contract is charged at this × demand rate"><Num value={t.excessDemandMultiplier} onChange={(v) => u('tariff.excessDemandMultiplier', v)} /></Field>
          <Field label="Prompt payment discount (%)"><Num value={t.ppdPct} onChange={(v) => u('tariff.ppdPct', v)} /></Field>
          <Field label="Delay payment charge (%)"><Num value={t.dpcPct} onChange={(v) => u('tariff.dpcPct', v)} /></Field>
          <Field label="Bulk consumption rebate (% of energy, check)"><Num value={t.bulkRebatePct} onChange={(v) => u('tariff.bulkRebatePct', v)} /></Field>
          <Field label="Incremental consumption rebate (₹/unit)"><Num value={t.icrRate} onChange={(v) => u('tariff.icrRate', v)} /></Field>
          <Field label="ICR reference consumption (kVAh)"><Num value={t.icrReferenceKvah} onChange={(v) => u('tariff.icrReferenceKvah', v)} /></Field>
          <Field label="Load factor incentive starts at (%)"><Num value={t.lfThresholdPct} onChange={(v) => u('tariff.lfThresholdPct', v)} /></Field>
          <Field label="Calibrated from" hint="Updated each time you enter a bill with its tax and rebate lines"><div className="input" style={{ background: 'var(--surface-2)' }}>{t.calibratedFrom}</div></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>Time-of-day zones</h2>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Zone</th><th>Name</th><th>From</th><th>To</th><th>₹ per unit (+ extra / − rebate)</th><th>MD counted?</th></tr></thead>
            <tbody>{t.zones.map((z: any, i: number) => (
              <tr key={i}>
                <td><Txt value={z.code} onChange={(v) => u(`tariff.zones.${i}.code`, v)} style={{ width: 60 }} /></td>
                <td><Txt value={z.label} onChange={(v) => u(`tariff.zones.${i}.label`, v)} /></td>
                <td><Txt type="time" value={z.from} onChange={(v) => u(`tariff.zones.${i}.from`, v)} /></td>
                <td><Txt value={z.to} onChange={(v) => u(`tariff.zones.${i}.to`, v)} style={{ width: 90 }} /></td>
                <td><Num value={z.rate} onChange={(v) => u(`tariff.zones.${i}.rate`, v ?? 0)} /></td>
                <td><select className="input" value={t.mdExcludedZones.includes(z.code) ? 'no' : 'yes'} onChange={(e) => u('tariff.mdExcludedZones', e.target.value === 'no' ? [...t.mdExcludedZones, z.code] : t.mdExcludedZones.filter((c: string) => c !== z.code))}><option value="yes">Yes</option><option value="no">No</option></select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
      <div><button className="btn primary" onClick={save}>Save tariff</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- bill history
export function BillsTab() {
  const q = useApi<any[]>('/bills');
  const blank = { month: new Date().toISOString().slice(0, 7), recordedMdKva: null, kvah: null, kwh: null, amountInr: null, dueDate: '', paid: false, note: '', icrEligibleKvah: null, icrReferenceKvah: null, taxOnSaleInr: null };
  const [b, setB] = useState<any>(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { signed } = useMe();
  const save = async (row: any) => {
    try {
      await signed((c) => api('/bills', { body: { ...row, month: row.month.length === 7 ? row.month + '-01' : row.month, dueDate: row.dueDate || null }, change: c }));
      setMsg({ ok: true, text: 'Saved. Contract demand advice and bill checks now use it.' }); setB(blank); q.reload();
    } catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); }
  };
  const del = async (month: string) => {
    try { await signed((c) => api(`/bills/${month}`, { method: 'DELETE', change: c })); q.reload(); } catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="stack">
      <section className="card stack">
        <div><h2>Add a bill</h2><p className="small ink2">Type in the numbers from your MSEDCL bills (only these figures; no account details). With 12 months of MD the contract demand advice is complete from day one. Due date and amount give you payment reminders.</p></div>
        <div className="form-grid">
          <Field label="Bill month"><input className="input" type="month" value={b.month} onChange={(e) => setB({ ...b, month: e.target.value })} /></Field>
          <Field label="Recorded MD (kVA)" hint="'Recorded MD (except A zone)' on the bill"><Num value={b.recordedMdKva} onChange={(v) => setB({ ...b, recordedMdKva: v })} /></Field>
          <Field label="Units (kVAh)"><Num value={b.kvah} onChange={(v) => setB({ ...b, kvah: v })} /></Field>
          <Field label="Units (kWh)"><Num value={b.kwh} onChange={(v) => setB({ ...b, kwh: v })} /></Field>
          <Field label="Bill amount (₹)"><Num value={b.amountInr} onChange={(v) => setB({ ...b, amountInr: v })} /></Field>
          <Field label="Due date"><input className="input" type="date" value={b.dueDate} onChange={(e) => setB({ ...b, dueDate: e.target.value })} /></Field>
        </div>
        <div><h3>Optional: lines for calibration</h3><p className="small ink2">Fill these from the same bill and the shadow bill will match MSEDCL to the rupee from next month.</p></div>
        <div className="form-grid">
          <Field label="Tax on sale (₹)" hint="'Tax on Sale' line on page 3"><Num value={b.taxOnSaleInr} onChange={(v) => setB({ ...b, taxOnSaleInr: v })} /></Field>
          <Field label="Incremental rebate: units" hint="'Incremental Consumption Rebate ... on units'"><Num value={b.icrEligibleKvah} onChange={(v) => setB({ ...b, icrEligibleKvah: v })} /></Field>
          <Field label="Incremental rebate: reference consumption" hint="'Ref consumption' on the bill"><Num value={b.icrReferenceKvah} onChange={(v) => setB({ ...b, icrReferenceKvah: v })} /></Field>
        </div>
        {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
        <div><button className="btn primary" onClick={() => save(b)}>Save bill</button></div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Saved bills</h2></div>
        {!q.data ? <Loading error={q.error} /> : q.data.length === 0 ? <Empty title="No bills yet" /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Month</th><th className="r">MD (kVA)</th><th className="r">kVAh</th><th className="r">Amount</th><th>Due</th><th>Paid</th><th /></tr></thead>
              <tbody>{q.data.map((r) => (
                <tr key={r.month}>
                  <td>{fmt.month(r.month)}</td><td className="r">{fmt.n0(r.recordedMdKva)}</td><td className="r">{fmt.n0(r.kvah)}</td><td className="r">{fmt.inr(r.amountInr)}</td>
                  <td>{r.dueDate ? fmt.date(r.dueDate.slice(0, 10)) : '–'}</td>
                  <td>{r.paid ? <span className="chip s-good">Paid</span> : <button className="btn sm" onClick={() => save({ ...r, month: r.month.slice(0, 10), dueDate: r.dueDate?.slice(0, 10), paid: true })}>Mark as paid</button>}</td>
                  <td><button className="btn ghost sm danger" onClick={() => del(r.month.slice(0, 7))}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- users
function UsersTab({ me }: { me: Me }) {
  const q = useApi<any[]>('/users');
  const { signed } = useMe();
  const blank = { username: '', fullName: '', password: '', role: 'operator' };
  const [n, setN] = useState(blank);
  const [edit, setEdit] = useState<any>(null);
  const [reset, setReset] = useState<{ id: number; name: string; password: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (f: (c: any) => Promise<any>, ok: string) => {
    try { await signed(f); setMsg({ ok: true, text: ok }); q.reload(); return true; }
    catch (e: any) { if (!isCancel(e)) setMsg({ ok: false, text: e.message }); return false; }
  };
  const add = async () => { if (await run((c) => api('/users', { body: n, change: c }), `${n.fullName} can now sign in with the temporary password, and must choose their own at first sign-in.`)) setN(blank); };
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>People who can sign in</h2><p>One account per person. Accounts are never deleted (deactivate instead), and user names are never reused, so every record stays traceable.</p></div>
        {!q.data ? <Loading error={q.error} /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Password changed</th><th /></tr></thead>
              <tbody>{q.data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.fullName || '–'}</b><div className="tiny muted">{u.username}</div></td>
                  <td className="small">{ROLE_NAME[u.role] ?? u.role}</td>
                  <td>{!u.active ? <span className="chip s-neutral">Deactivated</span> : u.locked ? <span className="chip s-critical">Locked</span> : u.mustChange ? <span className="chip s-watch">Must change password</span> : <span className="chip s-good">Active</span>}</td>
                  <td className="small">{u.lastLogin ? fmt.dateTime(u.lastLogin) : 'never'}</td>
                  <td className="small">{fmt.date(u.passwordChangedAt.slice(0, 10))}</td>
                  <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    {u.locked && <button className="btn sm" onClick={() => run((c) => api(`/users/${u.id}/unlock`, { body: {}, change: c }), `${u.fullName} is unlocked.`)}>Unlock</button>}
                    <button className="btn sm" onClick={() => setReset({ id: u.id, name: u.fullName || u.username, password: '' })}>Reset password</button>
                    <button className="btn sm" onClick={() => setEdit({ id: u.id, fullName: u.fullName, role: u.role, active: u.active, self: u.id === me.id })}>Edit</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {edit && (
        <section className="card stack">
          <div className="card-head"><h2>Edit {edit.fullName}</h2><button className="btn ghost sm" onClick={() => setEdit(null)}>Close</button></div>
          <div className="form-grid">
            <Field label="Full name" hint="Printed with their electronic signatures"><Txt value={edit.fullName} onChange={(v) => setEdit({ ...edit, fullName: v })} /></Field>
            <Field label="Role" hint={ROLE_HELP[edit.role]}><select className="input" value={edit.role} disabled={edit.self} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Account"><select className="input" value={edit.active ? 'on' : 'off'} disabled={edit.self} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'on' })}><option value="on">Active</option><option value="off">Deactivated (cannot sign in; records kept)</option></select></Field>
          </div>
          <div><button className="btn primary" onClick={async () => { if (await run((c) => api(`/users/${edit.id}`, { method: 'PUT', body: edit, change: c }), 'Saved.')) setEdit(null); }}>Save</button></div>
        </section>
      )}
      {reset && (
        <section className="card stack">
          <div className="card-head"><h2>Temporary password for {reset.name}</h2><button className="btn ghost sm" onClick={() => setReset(null)}>Close</button></div>
          <p className="small ink2">Give it to the person directly. They must choose their own password when they next sign in. The account is also unlocked.</p>
          <div className="form-grid"><Field label="Temporary password"><Txt type="password" value={reset.password} onChange={(v) => setReset({ ...reset, password: v })} autoComplete="new-password" /></Field></div>
          <div><button className="btn primary" onClick={async () => { if (await run((c) => api(`/users/${reset.id}/reset-password`, { body: { password: reset.password }, change: c }), `Temporary password set for ${reset.name}.`)) setReset(null); }}>Set temporary password</button></div>
        </section>
      )}
      <section className="card stack">
        <h2>Add a person</h2>
        <div className="form-grid">
          <Field label="Full name" hint="Printed with their electronic signatures"><Txt value={n.fullName} onChange={(v) => setN({ ...n, fullName: v })} autoComplete="off" /></Field>
          <Field label="User name"><Txt value={n.username} onChange={(v) => setN({ ...n, username: v })} autoComplete="off" /></Field>
          <Field label="Temporary password" hint="They choose their own at first sign-in"><Txt type="password" value={n.password} onChange={(v) => setN({ ...n, password: v })} autoComplete="new-password" /></Field>
          <Field label="Role" hint={ROLE_HELP[n.role]}><select className="input" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value })}>{Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
        <div><button className="btn primary" onClick={add}>Add person</button></div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 21 CFR Part 11
function ComplianceTab() {
  const { s, setS, save, msg, error } = useSettings();
  if (!s) return <Loading error={error} />;
  const c = s.compliance;
  const u = (k: string, v: any) => setS(set(s, `compliance.${k}`, v));
  const yn = (k: string) => <select className="input" value={c[k] ? 'on' : 'off'} onChange={(e) => u(k, e.target.value === 'on')}><option value="on">On</option><option value="off">Off</option></select>;
  return (
    <div className="stack">
      <div className="note-box">These controls follow FDA 21 CFR Part 11 (electronic records and electronic signatures). Part 11 applies when the records are required by GMP rules your QA team names (for example, a chiller serving a cleanroom). Keep them on unless QA decides otherwise; every change here is itself signed and audited.</div>
      <section className="card stack">
        <h2>Controls</h2>
        <div className="form-grid">
          <Field label="21 CFR Part 11 mode" hint="Off: no reasons or signatures, simpler password rules">{yn('part11Mode')}</Field>
          <Field label="Sign changes to settings, meters, bills and users" hint="Password re-entry for each change">{yn('signConfigChanges')}</Field>
          <Field label="Sign alarm acknowledge and close">{yn('signAlarmActions')}</Field>
        </div>
      </section>
      <section className="card stack">
        <h2>Passwords and sessions (§11.300)</h2>
        <div className="form-grid">
          <Field label="Minimum password length"><Num value={c.passwordMinLength} onChange={(v) => u('passwordMinLength', v ?? 12)} min={8} /></Field>
          <Field label="Passwords that cannot be reused"><Num value={c.passwordHistory} onChange={(v) => u('passwordHistory', v ?? 5)} min={0} /></Field>
          <Field label="Password expires after (days)" hint="0 = never"><Num value={c.passwordExpiryDays} onChange={(v) => u('passwordExpiryDays', v ?? 90)} min={0} /></Field>
          <Field label="Lock account after wrong passwords" hint="An admin unlocks it; a security alert is raised"><Num value={c.maxFailedLogins} onChange={(v) => u('maxFailedLogins', v ?? 5)} min={3} /></Field>
          <Field label="Sign out after inactivity (minutes)"><Num value={c.idleTimeoutMin} onChange={(v) => u('idleTimeoutMin', v ?? 15)} min={2} /></Field>
          <Field label="Longest session (hours)"><Num value={c.sessionMaxHours} onChange={(v) => u('sessionMaxHours', v ?? 12)} min={1} /></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>Record retention (§11.10(c))</h2>
        <p className="small ink2">15-minute data, alarms, events, bills, signatures and the audit trail are kept for good. Only raw 5-second readings leave the database, after this many days, and only after being written to a checksummed archive file.</p>
        <div className="form-grid">
          <Field label="Keep raw readings online (days)"><Num value={c.rawReadingsKeepDays} onChange={(v) => u('rawReadingsKeepDays', v ?? 90)} min={7} /></Field>
          <Field label="Archive before removing">{yn('archiveBeforeDelete')}</Field>
        </div>
      </section>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
      <div><button className="btn primary" onClick={save}>Save compliance settings</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- notifications
function NotifyTab() {
  const { s, setS, save, msg, error } = useSettings();
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  if (!s) return <Loading error={error} />;
  const sendTest = async () => {
    await save();
    try { await api('/notify/test', { body: {} }); setTest({ ok: true, text: 'Test message sent. Check the Teams channel.' }); }
    catch (e: any) { setTest({ ok: false, text: e.message }); }
  };
  const sendMail = async () => {
    await save();
    try { await api('/notify/test-email', { body: {} }); setTest({ ok: true, text: 'Test email sent. Check the inbox (and spam folder).' }); }
    catch (e: any) { setTest({ ok: false, text: e.message }); }
  };
  const n = s.notify;
  const un = (k: string, v: any) => setS(set(s, `notify.${k}`, v));
  return (
    <div className="stack">
    <section className="card stack">
      <div><h2>Email alerts and daily report</h2><p className="small ink2">Works with Microsoft 365, Gmail (app password) or your company mail server. The password is stored encrypted and never shown again.</p></div>
      <div className="form-grid">
        <Field label="Email alerts"><select className="input" value={n.emailEnabled ? 'on' : 'off'} onChange={(e) => un('emailEnabled', e.target.value === 'on')}><option value="off">Off</option><option value="on">On</option></select></Field>
        <Field label="Mail server" hint="Microsoft 365: smtp.office365.com; Gmail: smtp.gmail.com"><Txt value={n.smtpHost} onChange={(v) => un('smtpHost', v)} /></Field>
        <Field label="Port"><Num value={n.smtpPort} onChange={(v) => un('smtpPort', v ?? 587)} /></Field>
        <Field label="Security"><select className="input" value={n.smtpSecurity} onChange={(e) => un('smtpSecurity', e.target.value)}><option value="starttls">STARTTLS (port 587)</option><option value="ssl">SSL (port 465)</option><option value="none">None (internal server only)</option></select></Field>
        <Field label="Mail user name"><Txt value={n.smtpUser} onChange={(v) => un('smtpUser', v)} autoComplete="off" /></Field>
        <Field label="Mail password"><Txt type="password" value={n.smtpPasswordProtected} onChange={(v) => un('smtpPasswordProtected', v)} autoComplete="new-password" /></Field>
        <Field label="Send from (email address)"><Txt value={n.emailFrom} onChange={(v) => un('emailFrom', v)} /></Field>
        <Field label="Send to" hint="Several addresses: separate with commas"><Txt value={n.emailTo} onChange={(v) => un('emailTo', v)} /></Field>
        <Field label="Email alerts from"><select className="input" value={n.emailMinSeverity} onChange={(e) => un('emailMinSeverity', e.target.value)}><option value="critical">Act now only</option><option value="serious">Needs attention and above</option><option value="watch">Watch and above</option></select></Field>
        <Field label="Daily report email at" hint="Yesterday's report with the 15-minute data file. Empty = off"><Txt value={n.dailyReportAt} onChange={(v) => un('dailyReportAt', v)} placeholder="08:00" /></Field>
      </div>
      <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={sendMail} disabled={!n.emailEnabled}>Save and send a test email</button></div>
    </section>
    <section className="card stack">
      <div><h2>Microsoft Teams alerts</h2><p className="small ink2">In Teams, open the channel, choose Workflows → "Post to a channel when a webhook request is received", and paste the link it gives you here.</p></div>
      <div className="form-grid">
        <Field label="Teams link (webhook)"><Txt value={s.notify.teamsWebhookUrl} onChange={(v) => setS(set(s, 'notify.teamsWebhookUrl', v))} placeholder="https://…" /></Field>
        <Field label="Send alerts from"><select className="input" value={s.notify.minSeverity} onChange={(e) => setS(set(s, 'notify.minSeverity', e.target.value))}><option value="critical">Act now only</option><option value="serious">Needs attention and above</option><option value="watch">Watch and above</option></select></Field>
      </div>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}
      {test && <div className={test.ok ? 'ok-box' : 'error-box'}>{test.text}</div>}
      <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={sendTest} disabled={!s.notify.teamsWebhookUrl}>Save and send a test</button></div>
    </section>
    </div>
  );
}
