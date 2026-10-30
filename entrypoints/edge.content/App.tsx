// The panel on Microsoft Partner Center's Edge pages. The listing comes from
// Extension Tower: the popup's Edge button opens Partner Center, the user
// links the Edge product once, then Sync loads the listing and Autofill fills
// the open page (Properties, Privacy, or one language's Store listing details).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Stopped } from '../../lib/dashboard';
import {
  createButton, edgePage, fillLanguage, findProduct, isOverview, listedProducts, fillPrivacy, fillProperties, planLanguage, planPrivacy, planProperties, SAVE_LABEL, type EdgePage,
} from '../../lib/edge';
import { buildPackage, loadPackage, savePackage } from '../../lib/reader';
import { NotFound } from '../../components/NotFound';
import { matchName } from '../../lib/match';
import { towerDone, towerFiles, towerHello, towerLink, towerMode, towerStatus, type Hello, type Pending } from '../../lib/tower';
import type { Package, PlanStep, RunContext, RunRecord } from '../../lib/types';

const PAGE_NAMES = { properties: 'Properties', privacy: 'Privacy' } as const;
type Fillable = 'properties' | 'privacy' | 'language';
const fillable = (p: EdgePage): p is EdgePage & { kind: Fillable } => p.kind === 'properties' || p.kind === 'privacy' || p.kind === 'language';

function plan(pkg: Package, page: EdgePage & { kind: Fillable }): PlanStep[] {
  if (page.kind === 'properties') return planProperties(pkg);
  if (page.kind === 'privacy') return planPrivacy(pkg);
  return planLanguage(pkg, page.language!);
}

function makeCtx(onProgress: (t: string) => void) {
  const records: RunRecord[] = [];
  let stop = false;
  const push = (status: RunRecord['status'], text: string, copy?: string) => { records.push({ status, text, copy }); if (status !== 'fail') onProgress(text); };
  const ctx: RunContext = {
    records, ok: (t) => push('ok', t), fail: (t, c) => push('fail', t, c), skip: (t) => push('skip', t), info: (t) => push('info', t),
    progress: onProgress, check() { if (stop) throw new Stopped('Stopped'); },
  };
  return { ctx, stop: () => { stop = true; } };
}

export default function App() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<EdgePage>(edgePage);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [hello, setHello] = useState<Hello>({ linked: null, pending: null });
  const [pkg, setPkg] = useState<Package | null>(null);
  const [busy, setBusy] = useState<{ text: string; stop?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<PlanStep[] | null>(null);
  const [result, setResult] = useState<{ text: ReactNode; tone?: 'ok' | 'bad'; fails: RunRecord[] } | null>(null);
  const synced = useRef(false);
  const [notFound, setNotFound] = useState<Pending | null>(null);

  // Partner Center is a single-page app: follow its URL and heading.
  useEffect(() => {
    let last = JSON.stringify(edgePage());
    const timer = setInterval(() => {
      const next = edgePage();
      if (JSON.stringify(next) === last) return;
      last = JSON.stringify(next);
      setPage(next); setConfirm(null); setResult(null);
    }, 700);
    return () => clearInterval(timer);
  }, []);

  const sync = useCallback(async (id: string) => {
    setBusy({ text: 'Syncing…' }); setResult(null);
    try {
      const next = await buildPackage(await towerFiles(id), 'Extension Tower');
      await savePackage(next);
      setPkg(next);
    } catch (e) {
      setResult({ text: (e as Error).message, tone: 'bad', fails: [] });
    } finally { setBusy(null); }
  }, []);

  const link = async () => {
    if (!page.productId) return;
    try {
      const h = await towerLink('edge', page.productId);
      setHello(h);
      await towerDone();
      if (h.linked) await sync(h.linked.id);
    } catch (e) { setResult({ text: (e as Error).message, tone: 'bad', fails: [] }); }
  };

  // Carry on an update the popup started: on the overview, find the product by
  // name and open it (or offer a new listing); on a product, sync it, or link it
  // when it's the new listing the user just created.
  useEffect(() => {
    let gone = false;
    (async () => {
      setConnected((await towerStatus('').catch(() => ({ connected: false }))).connected);
      const h = await towerHello('edge', page.productId).catch(() => ({ linked: null, pending: null }) as Hello);
      if (gone) return;
      setHello(h);
      if (h.linked || h.pending) setOpen(true);
      const saved = (await loadPackage().catch(() => undefined)) ?? null;
      if (saved && h.linked && saved.itemId === h.linked.id) setPkg(saved);
      const p = h.pending;
      if (!p || synced.current) return;
      if (page.productId) {
        if (h.linked?.id === p.id) { synced.current = true; await towerDone(); await sync(p.id); }
        else if (!h.linked && p.mode === 'create' && !p.existing?.includes(page.productId)) { synced.current = true; await link(); }
        return;
      }
      if (p.mode !== 'find' || !isOverview()) return;
      setBusy({ text: `Looking for ${p.name}…` });
      const hit = await findProduct(p.name, matchName);
      if (gone) return;
      setBusy(null);
      if (!hit) return setNotFound(p);
      await towerLink('edge', hit.id).catch(() => {});
      location.href = hit.href;
    })();
    return () => { gone = true; };
  }, [page.productId, sync]);

  const run = async () => {
    if (!pkg || !fillable(page)) return;
    setConfirm(null); setResult(null);
    const { ctx, stop } = makeCtx((t) => setBusy((b) => (b ? { ...b, text: t } : b)));
    setBusy({ text: 'Autofilling…', stop });
    try {
      if (page.kind === 'properties') await fillProperties(ctx, pkg);
      else if (page.kind === 'privacy') await fillPrivacy(ctx, pkg);
      else await fillLanguage(ctx, pkg, page.language!);
    } catch (e) {
      if (!(e instanceof Stopped)) ctx.fail(`Unexpected error: ${(e as Error).message}`);
    }
    setBusy(null);
    const fails = ctx.records.filter((r) => r.status === 'fail');
    const oks = ctx.records.filter((r) => r.status === 'ok').length;
    setResult(fails.length
      ? { text: <><span className="ok-text">✓ {oks}</span> · <span className="bad-text">✗ {fails.length}</span></>, tone: 'bad', fails }
      : { text: `Done · ${SAVE_LABEL[page.kind]}`, tone: 'ok', fails: [] });
  };
  const requestRun = () => {
    if (!pkg || !fillable(page)) return;
    const steps = plan(pkg, page);
    if (steps.some((s) => s.destructive)) setConfirm(steps); else run();
  };

  // ---- What the card shows ---------------------------------------------------

  const { linked, pending } = hello;
  let status: ReactNode;
  let icon: IconName = 'ready';
  let tone = '';
  let main: ReactNode = null;
  if (busy) { status = busy.text; icon = 'sync'; main = busy.stop && <button className="btn danger" onClick={busy.stop}><Icon name="stop" /><span>Stop</span></button>; }
  else if (confirm) {
    status = confirm.filter((s) => s.destructive).map((s) => s.text.replace(/^Replace /, '')).join(', ');
    tone = 'bad'; icon = 'error';
    main = <><button className="btn danger" onClick={run}><Icon name="autofill" /><span>Replace</span></button><button className="btn ghost" onClick={() => setConfirm(null)}><span>Cancel</span></button></>;
  } else if (result) { status = result.text; tone = result.tone ?? ''; icon = tone === 'bad' ? 'error' : 'check'; }
  else if (connected === false) status = 'Connect Extension Tower in the CWSAgent popup';
  else if (!linked && pending) {
    status = page.productId ? <>Link <b>{pending.name}</b> to this Edge item?</> : <>Open <b>{pending.name}</b> to link it</>;
    if (page.productId) main = <button className="btn" onClick={link}><Icon name="check" /><span>Link</span></button>;
  } else if (!linked) status = 'Choose Edge for an extension in the CWSAgent popup';
  else if (!pkg) { status = <>In Extension Tower: <b>{linked.name}</b></>; }
  else if (page.kind === 'listings') status = 'Open a language’s Edit details';
  else if (page.kind === 'other') status = 'Open Store listings, Properties or Privacy';
  else if (fillable(page) && !plan(pkg, page).length) status = `Nothing to autofill on ${page.kind === 'language' ? page.language : PAGE_NAMES[page.kind]}`;
  else if (fillable(page)) {
    status = `${page.kind === 'language' ? page.language : PAGE_NAMES[page.kind]} ready`;
    main = <button className="btn" onClick={requestRun}><Icon name="autofill" /><span>Autofill</span></button>;
  }
  const syncButton = linked && !busy && !confirm && (
    <button className="btn ghost" onClick={() => sync(linked.id)}><Icon name="sync" /><span>{pkg ? 'Sync again' : 'Sync'}</span></button>
  );

  if (!open) {
    return <div className="wrap"><button className="bubble" title="CWSAgent" aria-label="Open CWSAgent" onClick={() => setOpen(true)}><Icon name="upload" /></button></div>;
  }
  return (
    <div className="wrap">
      {notFound && (
        <NotFound name={notFound.name} store="Edge Add-ons"
          onCreate={async () => { setNotFound(null); await towerMode('create', listedProducts()).catch(() => {}); createButton()?.click(); setResult({ text: 'Upload the package; CWSAgent links the new extension', fails: [] }); }}
          onPick={() => { setNotFound(null); towerMode('pick').catch(() => {}); setResult({ text: `Open ${notFound.name}, then press Link`, fails: [] }); }}
          onCancel={() => { setNotFound(null); towerDone().catch(() => {}); }}
        />
      )}
      <div className={`card ${busy ? 'working' : ''}`}>
        <div className="top">
          <button className="icon" title="Minimize" aria-label="Minimize" onClick={() => setOpen(false)}><Icon name="minimize" /></button>
        </div>
        <div className={`drop ${tone}`} role="status" aria-live="polite">
          <Icon name={icon} />
          <div className="status wrapText">{status}</div>
        </div>
        {(main || syncButton) && <div className="buttons">{main}{!confirm && syncButton}</div>}
        {result?.fails.length ? <div className="fails">{result.fails.slice(0, 5).map((f, i) => <div key={i} className="bad-text">{f.text}</div>)}</div> : null}
      </div>
    </div>
  );
}
