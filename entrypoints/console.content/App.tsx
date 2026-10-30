// The card on an item's Store listing, Privacy and Test instructions tabs, right
// under the tab's heading. It finds the item's listing in the Extension Tower
// account, asks for the API token when there's none, and Sync loads that listing
// and autofills the open tab. Drop a listing on the card to use a package instead;
// Settings holds Upload, Extract and History. Elsewhere nothing shows, unless a
// run or a popup-started update has something to say.
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { RANGE_LABELS, type RangeChoice } from '../../lib/analytics';
import {
  cardAnchor, fillListing, fillPrivacy, fillTest, itemTitle, main, pageButton, pageKind, planListing, planPrivacy, planTest,
  findItem, isItemList, listedItems, newItemButton, readyLanguageCount, Stopped, tabUrl, waitFor, type TabKind,
} from '../../lib/dashboard';
import {
  cancelExport, continueExport, DEFAULT_EXTRACT, exportState, startExport, stepsFor, type ExtractOptions,
} from '../../lib/extract';
import { buildPackage, clearPackage, filesFromDrop, filesFromInput, loadPackage, savePackage } from '../../lib/reader';
import { store } from '../../lib/store';
import { NotFound } from '../../components/NotFound';
import { matchName } from '../../lib/match';
import {
  towerConnect, towerDisconnect, towerDone, towerFiles, towerHello, towerLink, towerMatch, towerMode, towerReady,
  type Pending, type TowerDetails, type TowerMatch,
} from '../../lib/tower';
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

// ---- Run history (kept across page loads) ------------------------------------------

interface HistoryEntry { title: string; at: number; records: RunRecord[] }
const HISTORY_KEY = 'history';
const HISTORY_MAX = 20;

interface Run { ctx: RunContext; status: string; stop: () => void; stopping: boolean }
interface Status { text: ReactNode; tone?: 'ok' | 'bad'; onClick?: () => void }
interface Confirm { kind: TabKind; opts: ListingOptions; steps: PlanStep[] }
type PanelName = 'settings' | 'info' | 'history' | 'extract';
type Tower = TowerMatch & { error?: string };

const HEADING_WAIT_MS = 4000;

const counted = (n: number, word: string) => (n ? `${n} ${word}${n > 1 ? 's' : ''}` : null);
const detailParts = (d?: TowerDetails) => (d ? [
  counted(d.languages, 'language'), counted(d.screenshots, 'screenshot'), d.icon && 'Icon', d.smallTile && 'Small tile', d.marquee && 'Marquee',
  d.category, d.privacy && 'Privacy answers',
].filter((x): x is string => !!x) : []);

/**
 * Keeps the host right after the open tab's heading, through the console's
 * client-side navigation and re-renders. Off a tab it waits on the document,
 * showing nothing of its own. A tab whose heading can't be found gets the card
 * at the top of the page content after a moment. Returns whether it's inline.
 */
function useCardPlacement(host: HTMLElement, page: Page) {
  const [inline, setInline] = useState(false);
  useEffect(() => {
    const kind = page.kind;
    if (!isTab(kind)) {
      if (host.parentElement !== document.documentElement) document.documentElement.append(host);
      host.style.margin = '';
      setInline(false);
      return;
    }
    const since = Date.now();
    const place = () => {
      const anchor = cardAnchor(TAB_NAMES[kind]);
      if (anchor) {
        if (host.previousElementSibling !== anchor.after) anchor.after.after(host);
        host.style.margin = `0 ${anchor.inset}px`;
      } else if (Date.now() - since > HEADING_WAIT_MS) {
        if (main().firstElementChild !== host) main().prepend(host);
        host.style.margin = '';
      } else return;
      setInline(true);
    };
    let queued = 0;
    const later = () => { if (!queued) queued = window.setTimeout(() => { queued = 0; place(); }, 200); };
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true });
    const fallback = window.setTimeout(place, HEADING_WAIT_MS + 100);
    place();
    return () => { observer.disconnect(); clearTimeout(queued); clearTimeout(fallback); };
  }, [host, page.kind, page.itemId]);
  return inline;
}

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

export default function App({ host }: { host: HTMLElement }) {
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
  const [tower, setTower] = useState<Tower | null>(null);
  const [matching, setMatching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [iconFailed, setIconFailed] = useState<string | null>(null);
  const [autoFill, setAutoFill] = useState(false);
  const [notFound, setNotFound] = useState<Pending | null>(null);
  const [pick, setPick] = useState<Pending | null>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const pkgRef = useRef(pkg);
  pkgRef.current = pkg;
  const inline = useCardPlacement(host, page);

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

  // forItem: the listing was chosen for this console item, whatever ID it has in Extension Tower.
  const load = async (getFiles: () => Promise<FileEntry[]>, name?: string, forItem?: string) => {
    try {
      setFlash({ text: forItem ? 'Syncing…' : 'Reading…' });
      const files = await getFiles();
      if (!files.length) throw new Error('Nothing in that drop');
      const next = await buildPackage(files, name);
      if (forItem) next.itemId = forItem;
      await savePackage(next);
      setPkg(next);
      setOpts(listingDefaults(next));
      setConfirm(null);
      setFlash(null);
      return true;
    } catch (e) {
      setFlash({ text: (e as Error).message, tone: 'bad' });
      return false;
    }
  };

  // ---- Extension Tower -----------------------------------------------------------

  const refreshTower = useCallback(async () => {
    if (!towerReady() || !page.itemId || !isTab(page.kind)) return;
    setMatching(true);
    try {
      await waitFor(itemTitle, { timeout: 3000 });
      setTower(await towerMatch(page.itemId, itemTitle()));
    } catch (e) { setTower({ connected: true, error: (e as Error).message }); }
    setMatching(false);
  }, [page.itemId, page.kind]);
  useEffect(() => { refreshTower(); }, [refreshTower]);

  const syncFrom = async (id: string) => {
    setSyncing(true);
    const ok = await load(() => towerFiles(id), 'Extension Tower', page.itemId);
    setSyncing(false);
    if (ok) setDropped(false);
    else refreshTower(); // the token may have been revoked since the match
    return ok;
  };
  const source = tower?.source ?? null;
  const sync = async () => { if (source && await syncFrom(source.id)) setAutoFill(true); };
  const linkHere = async (id: string) => {
    if (!page.itemId) return;
    try {
      await towerLink('chrome', page.itemId);
      setPick(null);
      await towerDone();
      refreshTower();
      if (await syncFrom(id)) setAutoFill(true);
    } catch (e) { setFlash({ text: (e as Error).message, tone: 'bad' }); }
  };
  const drop = async (getFiles: () => Promise<FileEntry[]>, name?: string) => { if (await load(getFiles, name)) setDropped(true); };

  // Tell the background CWSAgent runs here (the popup warns until it has), and
  // carry on an update the popup started: on the item list, find the item and
  // open it (or offer a new listing); on the item, link it, sync and autofill.
  useEffect(() => {
    if (!towerReady()) return;
    let gone = false;
    (async () => {
      const publisher = location.pathname.match(/\/devconsole\/([0-9a-f-]{36})(?:\/|$)/)?.[1] ?? null;
      const h = await towerHello('chrome', page.itemId ?? null, publisher).catch(() => null);
      if (!h || gone) return;
      const p = h.pending;
      if (!p) return;
      if (page.itemId) {
        if (h.linked?.id === p.id) { await towerDone(); if (await syncFrom(p.id)) setAutoFill(true); }
        else if (!h.linked && p.mode === 'create' && !p.existing?.includes(page.itemId)) await linkHere(p.id);
        else if (!h.linked) setPick(p);
        return;
      }
      if (p.mode !== 'find' || !isItemList()) return;
      setFlash({ text: `Looking for ${p.name}…` });
      const hit = await findItem(p.itemId, p.name, matchName);
      if (gone) return;
      setFlash(null);
      if (!hit) return setNotFound(p);
      await towerLink('chrome', hit.id).catch(() => {});
      location.href = hit.href;
    })();
    return () => { gone = true; };
  }, [page.itemId]);
  const connect = async (key: string) => {
    try { await towerConnect(key); setTower({ connected: true }); await refreshTower(); } catch (e) { setTower({ connected: false, error: (e as Error).message }); }
  };
  const disconnect = async () => { await towerDisconnect().catch(() => {}); setTower({ connected: false }); };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const first = e.dataTransfer.items[0]?.webkitGetAsEntry?.();
    const dt = e.dataTransfer;
    drop(() => filesFromDrop(dt), first?.name.replace(/\.zip$/i, ''));
  };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(true); };

  // ---- Boot, navigation, popup status ---------------------------------------------

  useEffect(() => {
    (async () => {
      const p = (await loadPackage().catch(() => undefined)) ?? null;
      setPkg(p);
      if (p) setOpts(listingDefaults(p));
      setHistory((await store.get<HistoryEntry[]>(HISTORY_KEY).catch(() => undefined)) ?? []);
      const state = await exportState().catch(() => undefined);
      if (state && state.itemId === pageKind().itemId) resumeExport();
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
  useEffect(() => {
    if (!autoFill || !pkg) return;
    setAutoFill(false);
    if (canFill) requestFill(page.kind as TabKind);
    else if (isTab(page.kind)) setFlash({ text: `Nothing to autofill on ${TAB_NAMES[page.kind]}` });
  }, [autoFill, pkg]);
  const wrongItem = !!(pkg?.itemId && page.itemId && pkg.itemId !== page.itemId);

  const useTower = !!source && !dropped;
  let packageStatus: Status | null = null;
  if (pkg) {
    if (wrongItem) packageStatus = { text: 'Made for another item', tone: 'bad', onClick: () => setPanel('info') };
    else if (canFill) {
      const n = page.kind === 'listing' ? readyLanguageCount(pkg) : 0;
      packageStatus = { text: page.kind === 'listing' ? `${pkg.name} · ${n ? `${n} language${n > 1 ? 's' : ''} ready` : 'listing ready'}` : `${TAB_NAMES[page.kind as TabKind]} ready` };
    } else {
      const go = ORDER.find((k) => has(pkg, k));
      packageStatus = go ? { text: <>Go to <a href={tabUrl(go) ?? '#'}>{TAB_NAMES[go]}</a></> } : { text: 'Nothing to autofill here' };
    }
  }
  const fromTower = source && ['From ExtensionTower', ...detailParts(tower?.details)].join(' · ');

  let status: Status;
  if (run) status = { text: run.status };
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
  else if (pick && !source) status = { text: `Link ${pick.name} here?` };
  else if (dropped && packageStatus) status = packageStatus;
  else if (towerReady() && (!tower || matching)) status = { text: 'Matching…' };
  else if (tower?.error) status = { text: tower.error, tone: 'bad' };
  else if (fromTower) status = { text: fromTower };
  else if (packageStatus) status = packageStatus;
  else if (!towerReady()) status = { text: 'Drop a listing folder or ZIP' };
  else if (!tower?.connected) status = { text: 'Connect your ExtensionTower account' };
  else status = { text: 'No matching listing' };

  const askToken = inline && towerReady() && !!tower && !tower.connected && !matching && !run && !confirm;

  let actions: ReactNode;
  if (run) {
    actions = (
      <button className="btn danger" disabled={run.stopping} onClick={() => { run.stop(); setRun({ ...run, stopping: true }); }}>
        <Icon name="stop" /><span>{run.stopping ? 'Stopping…' : 'Stop'}</span>
      </button>
    );
  } else if (confirm) {
    const replaces = confirm.steps.some((s) => s.destructive && /screenshots/i.test(s.text));
    actions = (
      <>
        <button className="btn ghost" onClick={() => setConfirm(null)}><span>Cancel</span></button>
        <button className="btn danger" onClick={() => { const c = confirm; setConfirm(null); fill(c.kind, c.opts); }}>
          <Icon name="autofill" /><span>{replaces ? 'Replace' : 'Autofill anyway'}</span>
        </button>
      </>
    );
  } else if (pick && !source && page.itemId) {
    actions = <button className="btn" onClick={() => linkHere(pick.id)}><Icon name="check" /><span>Link</span></button>;
  } else if (inline) {
    let action: ReactNode = null;
    if (useTower) {
      action = (
        <button className={`btn ${syncing ? 'spin' : ''}`} disabled={syncing} onClick={sync}>
          <Icon name="sync" /><span>{syncing ? 'Syncing…' : 'Sync'}</span>
        </button>
      );
    } else if (canFill) {
      action = <button className={`btn ${askToken ? 'ghost' : ''}`} onClick={() => requestFill(page.kind as TabKind)}><Icon name="autofill" /><span>Autofill</span></button>;
    } else if (!towerReady()) {
      action = <button className="btn" onClick={() => dirInput.current?.click()}><Icon name="fileUpload" /><span>Upload</span></button>;
    } else if (tower?.connected && !matching) {
      action = <button className="btn ghost" onClick={refreshTower}><Icon name="sync" /><span>{tower.error ? 'Retry' : 'Check again'}</span></button>;
    }
    actions = (
      <>
        <button className={`icon ${panel ? 'pressed' : ''}`} title="Settings" aria-label="Settings" aria-pressed={!!panel} onClick={() => setPanel(panel ? null : 'settings')}><Icon name="settings" /></button>
        {action}
      </>
    );
  }

  const showSource = inline && useTower && !!source;
  const showCard = inline || !!run || !!flash || (!!pick && !!page.itemId);

  return (
    <>
      {notFound && (
        <NotFound name={notFound.name} store="this Chrome Web Store account"
          onCreate={async () => { setNotFound(null); await towerMode('create', listedItems()).catch(() => {}); newItemButton()?.click(); setFlash({ text: 'Upload the package; CWSAgent links the new item' }); }}
          onPick={() => { setPick(notFound); setNotFound(null); towerMode('pick').catch(() => {}); setFlash({ text: `Open ${notFound.name}, then press Link` }); }}
          onCancel={() => { setNotFound(null); towerDone().catch(() => {}); }}
        />
      )}
      {showCard && (
        <div className={`cws ${inline ? '' : 'floating'} ${over ? 'over' : ''}`} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <div className="cws-row">
            <div className="cws-text">
              <div className="cws-title"><Icon name="extension" /><span>CWS Agent</span></div>
              <div className="cws-source">
                {showSource && source.icon && iconFailed !== source.icon && (
                  <img src={source.icon} alt="" width={40} height={40} onError={() => setIconFailed(source.icon)} />
                )}
                <div className="cws-source-text">
                  {showSource && <div className="cws-name">{source.name}</div>}
                  {status.onClick
                    ? <button className={`cws-sub ${status.tone ?? ''}`} aria-live="polite" onClick={status.onClick}>{status.text}</button>
                    : <div className={`cws-sub ${status.tone ?? ''}`} aria-live="polite">{status.text}</div>}
                </div>
              </div>
              {askToken && <a className="cws-get" href={TOWER_URL} target="_blank" rel="noreferrer">Get a token</a>}
            </div>
            <div className="cws-actions">
              {actions}
              {askToken && (
                <form className="cws-token" onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.elements.namedItem('key') as HTMLInputElement;
                  connect(input.value);
                  input.value = '';
                }}>
                  <input name="key" type="password" placeholder="API token" autoComplete="off" spellCheck={false} aria-label="ExtensionTower API token" />
                  <button className="btn" type="submit"><span>Connect</span></button>
                </form>
              )}
            </div>
          </div>
          {askToken && (tower?.invalid || tower?.error) && (
            <div className="cws-sub bad" role="alert" style={{ marginTop: 8 }}>{tower.invalid ? 'ExtensionTower rejected that token.' : tower.error}</div>
          )}
          {inline && panel === 'extract' && !run && (
            <ExtractPanel options={extract} onChange={changeExtract} onStart={startExtract} onCancel={() => setPanel(null)} />
          )}
          {inline && panel === 'settings' && (
            <SettingsPanel
              pkg={pkg} page={page} opts={opts} setOpts={setOpts} tower={tower} onDisconnect={disconnect} hasHistory={history.length > 0} onPanel={setPanel}
              onForget={async () => { await clearPackage(); setPkg(null); setDropped(false); setFlash(null); setPanel(null); }}
              onZip={() => zipInput.current?.click()} onFolder={() => dirInput.current?.click()}
            />
          )}
          {inline && panel === 'info' && pkg && <InfoPanel pkg={pkg} page={page} />}
          {inline && panel === 'history' && history.length > 0 && (
            <HistoryPanel history={history} onClear={async () => { setHistory([]); setPanel(null); await store.delete(HISTORY_KEY).catch(() => {}); }} />
          )}
        </div>
      )}
      <input ref={dirInput} type="file" hidden {...{ webkitdirectory: '' }}
        onChange={(e) => { const f = e.target.files!; drop(() => filesFromInput(f), f[0]?.webkitRelativePath.split('/')[0]); e.target.value = ''; }} />
      <input ref={zipInput} type="file" hidden accept=".zip,application/zip"
        onChange={(e) => { const f = e.target.files!; drop(() => filesFromInput(f), f[0]?.name.replace(/\.zip$/i, '')); e.target.value = ''; }} />
    </>
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

const GUIDE_URL = 'https://github.com/Vadagon/cwsagent#make-a-listing-package';
const TOWER_URL = 'https://extensiontower.com/dashboard';

function SettingsPanel(props: {
  pkg: Package | null; page: Page; opts: ListingOptions | null; setOpts: (o: ListingOptions) => void;
  onForget: () => void; onZip: () => void; onFolder: () => void;
  tower: Tower | null; onDisconnect: () => void; hasHistory: boolean; onPanel: (p: PanelName) => void;
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
          <a href={GUIDE_URL} target="_blank" rel="noreferrer">Make a package</a>
        </div>
      </div>
      <div className="links">
        <button className="link" disabled={!props.page.itemId} onClick={() => props.onPanel('extract')}>Extract</button>
        {props.hasHistory && <button className="link" onClick={() => props.onPanel('history')}>History</button>}
        {pkg && <button className="link" onClick={() => props.onPanel('info')}>Loaded listing</button>}
        {towerReady() && props.tower?.connected && <button className="link" onClick={props.onDisconnect}>Disconnect ExtensionTower</button>}
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
