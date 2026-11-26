import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, fmt, Icon, useApi } from './lib';
import { ROLE_NAME, SignProvider, type Me } from './components/sign';
import Overview from './pages/Overview';
import Actions from './pages/Actions';
import Alerts from './pages/Alerts';
import Bill from './pages/Bill';
import Demand from './pages/Demand';
import Tod, { ZonePage } from './pages/Tod';
import Quality from './pages/Quality';
import Sources, { SourcePage } from './pages/Sources';
import Meters from './pages/Meters';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Connect from './pages/Connect';
import Trends from './pages/Trends';
import Compliance from './pages/Compliance';
import Account from './pages/Account';

export type { Me };

export default function App() {
  const [status, setStatus] = useState<any>(null);
  const [problem, setProblem] = useState<null | 'not-connected' | 'unreachable' | 'engine-setup'>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const loc = useLocation();

  const loadMe = () => api<Me>('/me').then(setMe).catch(() => setMe(null));
  const check = async () => {
    setProblem(null); setStatus(null); setMe(undefined);
    try {
      const g = await fetch('/gateway/status').then((r) => r.json());
      if (!g.connected) { setProblem('not-connected'); return; }
      const r = await fetch('/api/status');
      if (r.status === 502 || r.status === 504 || r.status === 503) { setProblem('unreachable'); return; }
      const st = await r.json();
      if (st.installMode) { setProblem('engine-setup'); return; }
      setStatus(st);
      loadMe();
    } catch { setProblem('unreachable'); }
  };

  useEffect(() => {
    check();
    const off = () => setMe(null);
    window.addEventListener('gl-logout', off);
    return () => window.removeEventListener('gl-logout', off);
  }, []);

  if (problem) return <Connect reason={problem} onDone={check} />;
  if (me === undefined || !status) return <div className="auth muted">Loading…</div>;
  if (!me) return <Login setup={status.setupNeeded} notice={notice} onLogin={() => { setNotice(null); loadMe(); }} />;
  if (me.mustChangePassword) return <Account me={me} forced onDone={loadMe} />;
  // The audit trail opens on its own page (new tab), without the menu
  if (loc.pathname.startsWith('/audit')) {
    return (
      <SignProvider me={me}>
        <div className="content" style={{ paddingTop: 28 }}>
          {me.perms.includes('audit') ? <Compliance /> : <div className="card"><div className="empty"><b>Your role cannot open the audit trail.</b></div></div>}
        </div>
      </SignProvider>
    );
  }
  return (
    <SignProvider me={me}>
      <Shell me={me} testFeed={status.testFeed} version={status.version}
        onLogout={(why) => { setNotice(why ?? null); setMe(null); }} />
    </SignProvider>
  );
}

/** Signs out after the idle time set in Settings → 21 CFR Part 11 (the Engine enforces it too). */
function useIdleLogout(minutes: number | undefined, onIdle: () => void) {
  const last = useRef(Date.now());
  useEffect(() => {
    if (!minutes) return;
    const bump = () => { last.current = Date.now(); };
    const evs = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (Date.now() - last.current > minutes * 60_000) onIdle(); }, 15_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [minutes, onIdle]);
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, close]);
  return ref;
}

/** Live date and time, dd/mm/yyyy hh:mm:ss */
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="clock" aria-live="off">
      <div className="d">{now.toLocaleDateString('en-IN', { weekday: 'long' })}, {p(now.getDate())}/{p(now.getMonth() + 1)}/{now.getFullYear()}</div>
      <div className="t">{p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}</div>
    </div>
  );
}

function Bell({ alerts }: { alerts: any }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const count = alerts ? alerts.critical + alerts.serious + alerts.watch : 0;
  const top: any[] = alerts?.top ?? [];
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="iconbtn" aria-label={`Alerts: ${count} open`} onClick={() => setOpen(!open)}>
        <Icon.bell size={20} />{count > 0 && <span className="dot">{count}</span>}
      </button>
      {open && (
        <div className="pop">
          <div className="pop-head"><b>Alerts</b><Link to="/alerts" className="small">See all</Link></div>
          {top.length === 0 ? <div className="empty"><b>All clear</b>No open alerts.</div> : top.map((a) => (
            <Link key={a.id} to="/alerts" className="pop-item">
              <div className="row" style={{ gap: 8 }}><span className={`zone-dot`} style={{ background: `var(--${a.severity === 'critical' ? 'critical' : a.severity === 'serious' ? 'serious' : a.severity === 'watch' ? 'warning' : 'info'})` }} /><span className="t">{a.title}</span></div>
              <div className="m">{fmt.dateTime(a.openedAt)}{a.status === 'acknowledged' ? ' · acknowledged' : ''}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ me, onTheme, onLogout, showSettings, showAudit }: { me: Me; onTheme: () => void; onLogout: () => void; showSettings: boolean; showAudit: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const name = me.fullName || me.username;
  const initials = name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="userpill" onClick={() => setOpen(!open)} aria-label="Account menu">
        <span className="av">{initials}</span>
        <span className="who"><b>{name}</b><span>{ROLE_NAME[me.role] ?? me.role}</span></span>
      </button>
      {open && (
        <div className="pop menu-list" style={{ width: 260 }}>
          <Link to="/account"><Icon.user size={17} />Account and password</Link>
          {showAudit && <a href="/audit" target="_blank" rel="noreferrer"><Icon.shield size={17} />Audit trail (opens a new page)</a>}
          {showSettings && <Link to="/settings"><Icon.gear size={17} />Settings</Link>}
          <button onClick={onTheme}><Icon.moon size={17} />Light / dark</button>
          <button onClick={onLogout}><Icon.logout size={17} />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Shell({ me, testFeed, version, onLogout }: { me: Me; testFeed: boolean; version: string; onLogout: (why?: string) => void }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const ov = useApi<any>('/overview', 15000);
  const can = (p: string) => me.perms.includes(p);
  const theme = () => {
    const cur = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gl-theme', next); } catch { /* ignore */ }
    window.dispatchEvent(new Event('gl-theme'));
  };
  const logout = async (why?: string) => { try { await api('/logout', { method: 'POST' }); } catch { /* already out */ } onLogout(why); };
  useIdleLogout(me.policy?.part11Mode ? me.policy.idleTimeoutMin : undefined, () => logout(`Signed out after ${me.policy?.idleTimeoutMin} minutes without activity.`));
  const gridOn = ov.data?.live?.gridOn ?? true;
  const alertCount = ov.data ? ov.data.alerts.critical + ov.data.alerts.serious + ov.data.alerts.watch : 0;

  const nav: [string, string, keyof typeof Icon, number?][] = [
    ['/', 'Overview', 'home'],
    ['/trends', 'Trends', 'trend'],
    ['/alerts', 'Alerts', 'bell', alertCount],
    ['/actions', 'Actions', 'check'],
    ['/bill', 'Bill', 'bill'],
    ['/md', 'MD', 'gauge'],
    ['/tod', 'TOD', 'clock'],
    ['/quality', 'Power quality', 'wave'],
    ['/sources', 'Grid · DG · Solar', 'plug'],
    ['/meters', 'Meters', 'meter'],
  ];
  const showSettings = can('configure') || can('users') || can('compliance');
  const showAudit = can('audit');
  return (
    <>
      {testFeed && <div className="testbar">TEST DATA: these numbers come from the meter simulator, not from real meters.</div>}
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
          <div className="drawer-head">
            <span className="brand"><span className="brand-mark"><Icon.bolt size={20} /></span><span className="brand-name">GridLedger<span>Energy</span></span></span>
            <button className="iconbtn" aria-label="Close menu" onClick={() => setOpen(false)}><Icon.x size={18} /></button>
          </div>
          <nav className="nav">
            {nav.map(([to, label, icon, badge]) => {
              const I = Icon[icon];
              return (
                <NavLink key={to} to={to} end={to === '/'}>
                  <I />{label}{badge ? <span className="badge">{badge}</span> : null}
                </NavLink>
              );
            })}
            <div className="nav-sep" />
            {showSettings && <NavLink to="/settings"><Icon.gear />Settings</NavLink>}
            {showAudit && <a href="/audit" target="_blank" rel="noreferrer"><Icon.shield />Audit trail ↗</a>}
          </nav>
          <div className="side-foot">Version {version}{me.policy?.part11Mode ? ' · 21 CFR Part 11 mode' : ''}</div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="left">
              <button className="iconbtn" aria-label="Open menu" onClick={() => setOpen(true)}><Icon.menu size={20} /></button>
              <Link to="/" className="brand"><span className="brand-mark"><Icon.bolt size={20} /></span><span className="brand-name">GridLedger<span>Energy</span></span></Link>
              <span className="plant-pill">
                {ov.data?.plantName ?? ''}
                <span className={`chip ${gridOn ? 's-good' : 's-critical'}`}>{gridOn ? 'Grid on' : 'Grid off'}</span>
              </span>
            </div>
            <div className="right">
              <Clock />
              <Bell alerts={ov.data?.alerts} />
              <UserMenu me={me} onTheme={theme} onLogout={() => logout()} showSettings={showSettings} showAudit={showAudit} />
            </div>
          </header>
          <main className="content">
            <Routes>
              <Route path="/" element={<Overview ov={ov.data} />} />
              <Route path="/trends" element={<Trends />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/actions" element={<Actions />} />
              <Route path="/bill" element={<Bill />} />
              <Route path="/md" element={<Demand />} />
              <Route path="/tod" element={<Tod />} />
              <Route path="/tod/:code" element={<ZonePage />} />
              <Route path="/quality" element={<Quality />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/sources/:role" element={<SourcePage />} />
              <Route path="/meters" element={<Meters />} />
              <Route path="/account" element={<Account me={me} />} />
              {showSettings && <Route path="/settings/*" element={<Settings me={me} />} />}
              <Route path="/demand" element={<Navigate to="/md" />} />
              <Route path="/savings" element={<Navigate to="/actions" />} />
              <Route path="/compliance" element={<Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}
