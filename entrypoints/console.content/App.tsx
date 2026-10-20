// The widget on every developer console page: a drop field with one status
// line and two buttons. Upload (or drop) a listing, then Autofill; Extract
// asks what to save, then downloads this item's listing as a ZIP. The header
// shows Settings, plus Info once a listing is loaded and History once
// something has run.
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { RANGE_LABELS, type RangeChoice } from '../../lib/analytics';
import {
  fillListing, fillPrivacy, fillTest, pageButton, pageKind, planListing, planPrivacy, planTest,
  readyLanguageCount, Stopped, tabUrl, type TabKind,
} from '../../lib/dashboard';
import {
  cancelExport, continueExport, DEFAULT_EXTRACT, exportState, startExport, stepsFor, type ExtractOptions,
} from '../../lib/extract';
import { buildPackage, clearPackage, filesFromDrop, filesFromInput, loadPackage, savePackage } from '../../lib/reader';
import { store } from '../../lib/store';
import type { FileEntry, ListingOptions, Package, Page, PlanStep, RunContext, RunRecord } from '../../lib/types';

const TAB_NAMES: Record<TabKind, string> = { listing: 'Store listing', privacy: 'Privacy', test: 'Test instructions' };
const SAVE_LABEL: Record<TabKind, string> = { listing: 'Save draft', privacy: 'Save draft', test: 'Save changes' };
const ORDER: TabKind[] = ['listing', 'privacy', 'test'];
const isTab = (k: string): k is TabKind => (ORDER as string[]).includes(k);

function has(p: Package | null, kind: TabKind): boolean {
  if (!p) return false;
  if (kind === 'listing') return !!(Object.keys(p.languages).length || p.images.screenshots.length || p.images.icon || p.images.smallTile || p.images.marquee || Object.keys(p.details).length);
  if (kind === 'privacy') return Object.keys(p.privacy).length > 0;
  return !!p.test && Object.keys(p.test).length > 0;
}

function listingDefaults(p: Package): ListingOptions {
  const langs = Object.values(p.languages);
  return {
    descriptions: langs.some((l) => l.description || l.promoVideo),
    localizedImages: langs.some((l) => l.screenshots?.length),
    images: !!(p.images.icon || p.images.smallTile || p.images.marquee || p.images.screenshots.length),
    details: Object.keys(p.details).length > 0,
  };
}

// ---- Saved preferences (this browser only) ----------------------------------------

const EXTRACT_KEY = 'cwsagent-extract';
function readExtract(): ExtractOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(EXTRACT_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_EXTRACT, ...saved };
  } catch { /* storage blocked or bad JSON */ }
  return DEFAULT_EXTRACT;
}
const writeExtract = (o: ExtractOptions) => { try { localStorage.setItem(EXTRACT_KEY, JSON.stringify(o)); } catch { /* blocked */ } };
const readOpen = () => { try { return localStorage.getItem('cwsagent-open') !== '0'; } catch { return true; } };

// ---- Run history (kept across page loads) ------------------------------------------

interface HistoryEntry { title: string; at: number; records: RunRecord[] }
const HISTORY_KEY = 'history';
const HISTORY_MAX = 20;

interface Run { ctx: RunContext; status: string; stop: () => void; stopping: boolean }
interface Status { text: ReactNode; tone?: 'ok' | 'bad'; icon?: IconName; onClick?: () => void }
interface Confirm { kind: TabKind; opts: ListingOptions; steps: PlanStep[] }
type PanelName = 'settings' | 'info' | 'history' | 'extract';

function makeCtx(onProgress: (text: string) => void) {
  const records: RunRecord[] = [];
  let stopRequested = false;
  const push = (status: RunRecord['status'], text: string, copy?: string) => {
    records.push({ status, text, copy });
    if (status === 'info' || status === 'ok') onProgress(text);
  };
  const ctx: RunContext = {
    records,
    ok: (t) => push('ok', t),
    fail: (t, copy) => push('fail', t, copy),
    skip: (t) => push('skip', t),
    info: (t) => push('info', t),
    progress: onProgress,
    check() { if (stopRequested) throw new Stopped('Stopped'); },
  };
  return { ctx, stop: () => { stopRequested = true; } };
}

export default function App() {
  const [open, setOpen] = useState(readOpen);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [page, setPage] = useState<Page>(pageKind());
  const [run, setRun] = useState<Run | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [flash, setFlash] = useState<Status | null>(null);
  const [opts, setOpts] = useState<ListingOptions | null>(null);
  const [extract, setExtract] = useState<ExtractOptions>(readExtract);
  const [over, setOver] = useState(false);
  const dirInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const pkgRef = useRef(pkg);
  pkgRef.current = pkg;

  const show = (v: boolean) => {
    setOpen(v);
    if (!v) setPanel(null);
    try { localStorage.setItem('cwsagent-open', v ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const toggle = (name: PanelName) => setPanel((cur) => (cur === name ? null : name));

  const addHistory = useCallback(async (entry: HistoryEntry) => {
    const saved = (await store.get<HistoryEntry[]>(HISTORY_KEY).catch(() => undefined)) ?? [];
    const next = [entry, ...saved].slice(0, HISTORY_MAX);
    setHistory(next);
    await store.set(HISTORY_KEY, next).catch(() => {});
  }, []);

  // ---- Runs -----------------------------------------------------------------

  const execute = useCallback(async (title: string, fn: (ctx: RunContext) => Promise<void>) => {
    const { ctx, stop } = makeCtx((text) => setRun((cur) => (cur ? { ...cur, status: text } : cur)));
    setFlash(null);
    setRun({ ctx, status: `${title}…`, stop, stopping: false });
    let stopped = false;
    try {
      await fn(ctx);
    } catch (e) {
      if (e instanceof Stopped) stopped = true;
      else ctx.fail(`Unexpected error: ${(e as Error).message}`);
    }
    return { ctx, stopped };
  }, []);

  const resultStatus = useCallback((records: RunRecord[], done: string): Status => {
    const fails = records.filter((r) => r.status === 'fail').length;
    const oks = records.filter((r) => r.status === 'ok').length;
    return fails
      ? { text: <><span className="ok-text">✓ {oks}</span> · <span className="bad-text">✗ {fails} — see history</span></>, tone: 'bad', onClick: () => setPanel('history') }
      : { text: done, tone: 'ok', onClick: () => setPanel('history') };
  }, []);

  const fill = async (kind: TabKind, o: ListingOptions) => {
    const p = pkgRef.current!;
    const res = await execute('Autofilling', async (ctx) => {
      if (kind === 'listing') await fillListing(ctx, p, o);
      else if (kind === 'privacy') await fillPrivacy(ctx, p);
      else await fillTest(ctx, p);
    });
    setRun(null);
    await addHistory({ title: `Autofill · ${TAB_NAMES[kind]}${res.stopped ? ' (stopped)' : ''}`, at: Date.now(), records: res.ctx.records });
    const next = ORDER.slice(ORDER.indexOf(kind) + 1).find((k) => has(p, k));
    setFlash(res.stopped
      ? { text: 'Stopped — see history', onClick: () => setPanel('history') }
      : resultStatus(res.ctx.records, `Done · ${SAVE_LABEL[kind]}${next ? `, then ${TAB_NAMES[next]}` : ''}`));
  };

  const requestFill = (kind: TabKind) => {
    if (!pkg) return;
    const o = opts ?? listingDefaults(pkg);
    const steps = kind === 'listing' ? planListing(pkg, o) : kind === 'privacy' ? planPrivacy(pkg) : planTest(pkg);
    const wrongItem = !!(pkg.itemId && pkg.itemId !== page.itemId);
    if (wrongItem) steps.unshift({ text: 'Package is for another item', destructive: true });
    if (steps.some((s) => s.destructive)) setConfirm({ kind, opts: o, steps });
    else fill(kind, o);
  };

  const resumeExport = useCallback(async () => {
    let outcome = 'none' as Awaited<ReturnType<typeof continueExport>>;
    const res = await execute('Extracting', async (ctx) => { outcome = await continueExport(ctx); });
    if (outcome === 'navigated') { setRun((cur) => (cur ? { ...cur, status: 'Extracting… next tab' } : cur)); return; }
    setRun(null);
    if (res.stopped) await cancelExport();
    const state = await exportState();
    const records = outcome === 'done' ? res.ctx.records : [...(state?.log ?? []), ...res.ctx.records];
    await addHistory({ title: res.stopped ? 'Extract (stopped)' : 'Extract', at: Date.now(), records });
    setFlash(res.stopped ? { text: 'Extract stopped' } : resultStatus(records, 'Saved to Downloads'));
  }, [execute, addHistory, resultStatus]);

  const startExtract = async () => {
    if (!page.itemId) return;
    setPanel(null);
    try {
      await startExport(page.itemId, extract);
      resumeExport();
    } catch (e) {
      setFlash({ text: (e as Error).message, tone: 'bad' });
    }
  };

  const changeExtract = (o: ExtractOptions) => { setExtract(o); writeExtract(o); };

  // ---- Loading a listing --------------------------------------------------------

  const load = async (getFiles: () => Promise<FileEntry[]>, name?: string) => {
    try {
      setFlash({ text: 'Reading…', icon: 'sync' });
      const files = await getFiles();
      if (!files.length) throw new Error('Nothing in that drop');
      const next = await buildPackage(files, name);
      await savePackage(next);
      setPkg(next);
      setOpts(listingDefaults(next));
      setConfirm(null);
      setFlash(null);
    } catch (e) {
      setFlash({ text: (e as Error).message, tone: 'bad' });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const first = e.dataTransfer.items[0]?.webkitGetAsEntry?.();
    const dt = e.dataTransfer;
    load(() => filesFromDrop(dt), first?.name.replace(/\.zip$/i, ''));
  };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); show(true); setOver(true); };

  // ---- Boot, navigation, popup status ---------------------------------------------

  useEffect(() => {
    (async () => {
      const p = (await loadPackage().catch(() => undefined)) ?? null;
      setPkg(p);
      if (p) setOpts(listingDefaults(p));
      setHistory((await store.get<HistoryEntry[]>(HISTORY_KEY).catch(() => undefined)) ?? []);
      const state = await exportState().catch(() => undefined);
      if (state && state.itemId === pageKind().itemId) { show(true); resumeExport(); }
    })();
    let last = location.pathname;
    const timer = setInterval(() => {
      if (location.pathname === last) return;
      last = location.pathname;
      setPage(pageKind());
      setConfirm(null);
      setFlash(null);
    }, 800);
    return () => clearInterval(timer);
  }, [resumeExport]);

  useEffect(() => {
    const runtime = (globalThis as any).chrome?.runtime;
    if (!runtime?.onMessage) return;
    const listener = (msg: any, sender: { id?: string }, reply: (r: unknown) => void) => {
      if (sender.id !== runtime.id || msg?.type !== 'cwsagent:status') return;
      reply({ active: true, page: pageKind().kind, package: pkgRef.current?.name ?? null });
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, []);

  // ---- What the card shows ----------------------------------------------------------

  const canFill = !!pkg && isTab(page.kind) && has(pkg, page.kind);
  const wrongItem = !!(pkg?.itemId && page.itemId && pkg.itemId !== page.itemId);

  let status: Status;
  if (run) status = { text: run.status, icon: 'sync' };
  else if (confirm) {
    const shots: string[] = [];
    for (const s of confirm.steps.filter((x) => x.destructive)) {
      if (/^Global screenshots/.test(s.text)) shots.push('global');
      const m = s.text.match(/^Localized screenshots[^:]*: (.*)$/);
      if (m?.[1]) shots.push(...m[1].split(', '));
    }
    const other = confirm.steps.some((x) => /another item/.test(x.text));
    status = { text: [other && 'Other item!', shots.length && `Replaces ${shots.join(', ')} screenshots`].filter(Boolean).join(' · '), tone: 'bad', onClick: () => setPanel('info') };
  } else if (flash) status = flash;
  else if (!pkg) status = { text: <><b>Drop listing folder or ZIP</b><br /><span className="muted">or click to choose</span></>, icon: 'upload' };
  else if (wrongItem) status = { text: 'Made for another item', tone: 'bad', onClick: () => setPanel('info') };
  else if (page.kind === 'other') status = { text: 'Open an item to autofill' };
  else if (canFill) {
    const n = page.kind === 'listing' ? readyLanguageCount(pkg) : 0;
    status = { text: page.kind === 'listing' ? (n ? `${n} language${n > 1 ? 's' : ''} ready` : 'Listing ready') : `${TAB_NAMES[page.kind as TabKind]} ready` };
  } else {
    const go = ORDER.find((k) => has(pkg, k));
    status = go ? { text: <>Go to <a href={tabUrl(go) ?? '#'}>{TAB_NAMES[go]}</a></> } : { text: 'Nothing to autofill here' };
  }
  const tone = status.tone ?? '';
  const statusIcon: IconName = status.icon ?? (tone === 'bad' ? 'error' : tone === 'ok' ? 'check' : pkg ? 'ready' : 'upload');

  const onFieldClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return; // tab links inside the status
    if (status.onClick) status.onClick();
    else if (!run) dirInput.current?.click();
  };

  let mainButton: ReactNode;
  let secondButton: ReactNode;
  if (run) {
    mainButton = (
      <button className="btn danger" disabled={run.stopping} onClick={() => { run.stop(); setRun({ ...run, stopping: true }); }}>
        <Icon name="stop" /><span>{run.stopping ? 'Stopping…' : 'Stop'}</span>
      </button>
    );
  } else if (confirm) {
    const replaces = confirm.steps.some((s) => s.destructive && /screenshots/i.test(s.text));
    mainButton = (
      <button className="btn danger" onClick={() => { const c = confirm; setConfirm(null); fill(c.kind, c.opts); }}>
        <Icon name="autofill" /><span>{replaces ? 'Replace' : 'Autofill anyway'}</span>
      </button>
    );
    secondButton = <button className="btn ghost" onClick={() => setConfirm(null)}><span>Cancel</span></button>;
  } else {
    mainButton = canFill
      ? <button className="btn" onClick={() => requestFill(page.kind as TabKind)}><Icon name="autofill" /><span>Autofill</span></button>
      : <button className="btn" onClick={() => dirInput.current?.click()}><Icon name="fileUpload" /><span>Upload</span></button>;
    secondButton = (
      <button className={`btn ghost ${panel === 'extract' ? 'pressed' : ''}`} disabled={!page.itemId}
        title="Choose what to save, then extract it to a ZIP in Downloads" onClick={() => toggle('extract')}>
        <Icon name="extract" /><span>Extract</span>
      </button>
    );
  }

  const headerButton = (name: PanelName, icon: IconName, label: string) => (
    <button className={`icon ${panel === name ? 'pressed' : ''}`} title={label} aria-label={label} aria-pressed={panel === name} onClick={() => toggle(name)}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="wrap">
      {open && panel === 'extract' && !run && (
        <ExtractPanel options={extract} onChange={changeExtract} onStart={startExtract} onCancel={() => setPanel(null)} />
      )}
      {open && panel === 'settings' && (
        <SettingsPanel
          pkg={pkg} page={page} opts={opts} setOpts={setOpts}
          onForget={async () => { await clearPackage(); setPkg(null); setFlash(null); setPanel(null); }}
          onZip={() => zipInput.current?.click()} onFolder={() => dirInput.current?.click()}
        />
      )}
      {open && panel === 'info' && pkg && <InfoPanel pkg={pkg} page={page} />}
      {open && panel === 'history' && history.length > 0 && (
        <HistoryPanel history={history} onClear={async () => { setHistory([]); setPanel(null); await store.delete(HISTORY_KEY).catch(() => {}); }} />
      )}
      {open ? (
        <div className={`card ${run ? 'working' : ''}`} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <div className="top">
            {pkg && headerButton('info', 'info', 'Loaded listing')}
            {history.length > 0 && headerButton('history', 'history', 'History')}
            {headerButton('settings', 'settings', 'Settings')}
            <button className="icon" title="Minimize" aria-label="Minimize" onClick={() => show(false)}><Icon name="minimize" /></button>
          </div>
          <div
            className={`drop ${tone} ${over ? 'over' : ''}`} role="button" tabIndex={0} onClick={onFieldClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFieldClick(e as unknown as React.MouseEvent); } }}
          >
            <Icon name={statusIcon} />
            <div className="status" aria-live="polite">{status.text}</div>
          </div>
          <div className="buttons">{mainButton}{secondButton}</div>
        </div>
      ) : (
        <button className="bubble" title="Autofill or extract this listing" aria-label="Open listing tools"
          onClick={() => show(true)} onDragOver={onDragOver} onDrop={onDrop}>
          <Icon name="upload" />
        </button>
      )}
      <input ref={dirInput} type="file" hidden {...{ webkitdirectory: '' }}
        onChange={(e) => { const f = e.target.files!; load(() => filesFromInput(f), f[0]?.webkitRelativePath.split('/')[0]); e.target.value = ''; }} />
      <input ref={zipInput} type="file" hidden accept=".zip,application/zip"
        onChange={(e) => { const f = e.target.files!; load(() => filesFromInput(f), f[0]?.name.replace(/\.zip$/i, '')); e.target.value = ''; }} />
    </div>
  );
}

// ---- Extract: what to save -------------------------------------------------------------

const EXTRACT_GROUPS: { title: string; items: [keyof ExtractOptions, string][] }[] = [
  { title: 'Listing', items: [['listing', 'Descriptions & details'], ['images', 'Icon, tiles & screenshots'], ['privacy', 'Privacy answers'], ['test', 'Test instructions']] },
  { title: 'Stats & feedback', items: [['installs', 'Installs & uninstalls'], ['impressions', 'Impressions'], ['users', 'Users'], ['ratings', 'Ratings'], ['support', 'User support']] },
];
const RANGE_ORDER: RangeChoice[] = ['30', '90', '180', '365', 'longest'];

function ExtractPanel({ options, onChange, onStart, onCancel }: {
  options: ExtractOptions; onChange: (o: ExtractOptions) => void; onStart: () => void; onCancel: () => void;
}) {
  const withRange = options.installs || options.impressions || options.users || options.ratings;
  const nothing = stepsFor(options).length === 0;
  return (
    <div className="more">
      {EXTRACT_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="sec-title">{g.title}</div>
          {g.items.map(([key, label]) => (
            <label key={key} className="opt">
              <input type="checkbox" checked={!!options[key]} onChange={(e) => onChange({ ...options, [key]: e.target.checked })} /> {label}
            </label>
          ))}
        </div>
      ))}
      {withRange && (
        <label className="range">
          <span className="sec-title">Date range</span>
          <select value={options.range} onChange={(e) => onChange({ ...options, range: e.target.value as RangeChoice })}>
            {RANGE_ORDER.map((r) => <option key={r} value={r}>{RANGE_LABELS[r]}</option>)}
          </select>
        </label>
      )}
      <div className="buttons" style={{ marginTop: 0 }}>
        <button className="btn" disabled={nothing} onClick={onStart}><Icon name="extract" /><span>Extract</span></button>
        <button className="btn ghost" onClick={onCancel}><span>Cancel</span></button>
      </div>
    </div>
  );
}

// ---- Settings ----------------------------------------------------------------------------

function SettingsPanel(props: {
  pkg: Package | null; page: Page; opts: ListingOptions | null; setOpts: (o: ListingOptions) => void;
  onForget: () => void; onZip: () => void; onFolder: () => void;
}) {
  const { pkg, opts, setOpts } = props;
  const defaults = pkg ? listingDefaults(pkg) : null;
  const optRows: [keyof ListingOptions, string][] = [
    ['descriptions', 'Descriptions & localized videos'], ['localizedImages', 'Localized screenshots'],
    ['images', 'Icon, tiles & global screenshots'], ['details', 'Category, URLs, mature content'],
  ];
  return (
    <div className="more">
      {pkg && opts && defaults && has(pkg, 'listing') && (
        <div>
          <div className="sec-title">Autofill on Store listing</div>
          {optRows.filter(([k]) => defaults[k]).map(([k, label]) => (
            <label key={k} className="opt">
              <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
            </label>
          ))}
        </div>
      )}
      <div>
        <div className="sec-title">Listing to autofill</div>
        <div className="links">
          <button className="link" onClick={props.onFolder}>Upload a folder</button>
          <button className="link" onClick={props.onZip}>Upload a ZIP</button>
          {pkg && <button className="link" onClick={props.onForget}>Forget loaded listing</button>}
        </div>
      </div>
      <div className="muted">Never saves, submits, ticks certifications or changes visibility.</div>
    </div>
  );
}

// ---- Info: the loaded listing ---------------------------------------------------------

function InfoPanel({ pkg, page }: { pkg: Package; page: Page }) {
  const langs = Object.values(pkg.languages);
  const chips: string[] = [];
  const d = langs.filter((l) => l.description).length;
  const ls = langs.filter((l) => l.screenshots?.length).length;
  if (d) chips.push(`${d} descriptions`);
  if (pkg.images.screenshots.length) chips.push(`${pkg.images.screenshots.length} screenshots`);
  if (ls) chips.push(`localized shots × ${ls}`);
  if (pkg.images.smallTile) chips.push('small tile');
  if (pkg.images.marquee) chips.push('marquee');
  if (pkg.images.icon) chips.push('icon');
  if (Object.keys(pkg.privacy).length) chips.push('privacy');
  if (pkg.test) chips.push('test instructions');
  const tabs = ORDER.filter((k) => has(pkg, k));
  return (
    <div className="more">
      <div>
        <div className="sec-title">{pkg.name}</div>
        <div className="chips">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>
        {pkg.itemId && page.itemId && pkg.itemId !== page.itemId && <div className="bad-text" style={{ marginTop: 4 }}>Made for item {pkg.itemId}.</div>}
        {pkg.notes.map((n) => <div key={n} className="muted" style={{ marginTop: 4 }}>{n}</div>)}
      </div>
      {page.itemId && tabs.length > 0 && (
        <div className="links">
          {tabs.map((k) => <a key={k} href={tabUrl(k) ?? '#'}>{TAB_NAMES[k]}</a>)}
          {isTab(page.kind) && <button className="link" onClick={() => pageButton(SAVE_LABEL[page.kind as TabKind])?.click()}>{SAVE_LABEL[page.kind as TabKind]}</button>}
        </div>
      )}
    </div>
  );
}

// ---- History: past runs ------------------------------------------------------------------

function HistoryPanel({ history, onClear }: { history: HistoryEntry[]; onClear: () => void }) {
  const [openAt, setOpenAt] = useState<number>(history[0]?.at ?? 0);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="more">
      {history.map((h) => {
        const ok = h.records.filter((r) => r.status === 'ok').length;
        const fails = h.records.filter((r) => r.status === 'fail');
        const isOpen = h.at === openAt;
        return (
          <div key={h.at}>
            <button className="hist-row" onClick={() => setOpenAt(isOpen ? 0 : h.at)} aria-expanded={isOpen}>
              <span className="sec-title" style={{ margin: 0 }}>{h.title}</span>
              <span className="muted">
                {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}<span className="ok-text">✓ {ok}</span>{fails.length > 0 && <> · <span className="bad-text">✗ {fails.length}</span></>}
              </span>
            </button>
            {isOpen && (
              <>
                {fails.map((f, i) => (
                  <div key={i} className="fail-row">
                    <span>{f.text}</span>
                    {f.copy && (
                      <button className="mini" onClick={async () => { await navigator.clipboard.writeText(f.copy!).catch(() => {}); setCopied(`${h.at}-${i}`); }}>
                        {copied === `${h.at}-${i}` ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                ))}
                <div className="log">{h.records.map((r) => `${{ ok: '✓', fail: '✗', skip: '–', info: '·' }[r.status]} ${r.text}`).join('\n')}</div>
              </>
            )}
          </div>
        );
      })}
      <div className="links"><button className="link" onClick={onClear}>Clear history</button></div>
    </div>
  );
}
