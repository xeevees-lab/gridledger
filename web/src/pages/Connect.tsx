import { useState } from 'react';
import { Icon } from '../lib';

/** Shown when the Dashboard is not connected to a GridLedger Engine, or the Engine cannot be reached. */
export default function Connect({ reason, onDone }: { reason: 'not-connected' | 'unreachable' | 'engine-setup'; onDone: () => void }) {
  const [url, setUrl] = useState('http://127.0.0.1:8090');
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/gateway/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engineUrl: url, gatewayKey: key }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not connect');
      onDone();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <div className="card stack" style={{ maxWidth: 480 }}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><Icon.bolt size={18} /></div>
          <div className="brand-name" style={{ color: 'var(--ink)' }}>GridLedger<span>Energy cost control</span></div>
        </div>
        {reason === 'unreachable' && (
          <>
            <h1 style={{ fontSize: 20 }}>The GridLedger Engine is not answering</h1>
            <p className="ink2">The Dashboard is working, but it cannot reach the Engine that collects meter data. On the Engine PC, check that the Windows service <b>GridLedger Engine</b> is running, then reload this page.</p>
            <button className="btn primary" style={{ justifyContent: 'center' }} onClick={onDone}>Try again</button>
          </>
        )}
        {reason === 'engine-setup' && (
          <>
            <h1 style={{ fontSize: 20 }}>The Engine needs its one-time setup</h1>
            <p className="ink2">On the Engine PC, open <b>http://127.0.0.1:8090</b> and connect the database. Then reload this page.</p>
            <button className="btn primary" style={{ justifyContent: 'center' }} onClick={onDone}>Reload</button>
          </>
        )}
        {reason === 'not-connected' && (
          <form className="stack" onSubmit={submit}>
            <div>
              <h1 style={{ fontSize: 20 }}>Connect to the GridLedger Engine</h1>
              <p className="ink2 small" style={{ marginTop: 4 }}>One-time step. The Engine is the backend that reads meters and runs the AI. Its address and gateway key are in the Engine's settings file (<code>C:\GridLedger\data\appsettings.Local.json</code>, value <code>GatewayKey</code>).</p>
            </div>
            <div className="field"><label>Engine address</label><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
              <span className="hint">Same PC: http://127.0.0.1:8090. Another server: https://server-name:8443</span></div>
            <div className="field"><label>Gateway key</label><input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} required autoComplete="off" /></div>
            {err && <div className="error-box">{err}</div>}
            <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Checking…' : 'Connect'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
