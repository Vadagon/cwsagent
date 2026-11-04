// The panel on Microsoft Partner Center's Edge pages. The listing comes from
// Extension Tower (the popup's Edge button opens Partner Center, the user links
// the Edge product once, then Sync loads it) or from a dropped meta/ folder with
// store/publish.json. Autofill fills the open page: Packages, Properties,
// Privacy, one language's details, or every language from Store listings.
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Stopped } from '../../lib/dashboard';
import {
  createButton, edgePage, fillAllLanguages, fillLanguage, findProduct, isOverview, listedProducts, fillPrivacy, fillProperties, planAllLanguages, planLanguage,
  planPackage, planPrivacy, planProperties, SAVE_LABEL, saveLanguage, uploadPackage, type EdgePage,
} from '../../lib/edge';
import { buildPackage, filesFromDrop, filesFromInput, loadPackage, savePackage } from '../../lib/reader';
import { NotFound } from '../../components/NotFound';
import { matchName } from '../../lib/match';
import { towerDone, towerFiles, towerHello, towerLink, towerMode, towerStatus, type Hello, type Pending } from '../../lib/tower';
import type { FileEntry, Package, PlanStep, RunContext, RunRecord } from '../../lib/types';

const PAGE_NAMES = { packages: 'Packages', properties: 'Properties', privacy: 'Privacy', listings: 'Store listings' } as const;
type Fillable = 'packages' | 'properties' | 'privacy' | 'listings' | 'language';
const fillable = (p: EdgePage): p is EdgePage & { kind: Fillable } => p.kind !== 'other';
const pageName = (p: EdgePage & { kind: Fillable }) => (p.kind === 'language' ? p.language! : PAGE_NAMES[p.kind]);
const AFTER: Record<Fillable, string> = { ...SAVE_LABEL, language: 'Saved as draft', packages: 'Save & Continue', listings: 'Review, then Publish yourself' };

function plan(pkg: Package, page: EdgePage & { kind: Fillable }): PlanStep[] {
  if (page.kind === 'packages') return planPackage(pkg);
  if (page.kind === 'properties') return planProperties(pkg);
  if (page.kind === 'privacy') return planPrivacy(pkg);
  if (page.kind === 'listings') return planAllLanguages(pkg);
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
  const [over, setOver] = useState(false);
  const dirInput = useRef<HTMLInputElement>(null);
  // A dropped meta/ folder: works without Extension Tower.
  const local = !!pkg?.publish;

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
      if (saved && ((h.linked && saved.itemId === h.linked.id) || saved.publish)) setPkg(saved);
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

  const drop = async (getFiles: () => Promise<FileEntry[]>, name?: string) => {
    setBusy({ text: 'Reading…' }); setResult(null); setConfirm(null);
    try {
      const files = await getFiles();
      if (!files.length) throw new Error('Nothing in that drop');
      const next = await buildPackage(files, name);
      await savePackage(next);
      setPkg(next);
      setOpen(true);
      const wrong = next.publish?.edgeProductId && page.productId && next.publish.edgeProductId !== page.productId;
      if (wrong) setResult({ text: 'This folder is for another Edge product', tone: 'bad', fails: [] });
    } catch (e) {
      setResult({ text: (e as Error).message, tone: 'bad', fails: [] });
    } finally { setBusy(null); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const dt = e.dataTransfer;
    const first = dt.items[0]?.webkitGetAsEntry?.();
    drop(() => filesFromDrop(dt), first?.name.replace(/\.zip$/i, ''));
  };

  const run = async () => {
    if (!pkg || !fillable(page)) return;
    setConfirm(null); setResult(null);
    const { ctx, stop } = makeCtx((t) => setBusy((b) => (b ? { ...b, text: t } : b)));
    setBusy({ text: 'Autofilling…', stop });
    try {
      if (page.kind === 'packages') await uploadPackage(ctx, pkg);
      else if (page.kind === 'properties') await fillProperties(ctx, pkg);
      else if (page.kind === 'privacy') await fillPrivacy(ctx, pkg);
      else if (page.kind === 'listings') await fillAllLanguages(ctx, pkg, page.productId!);
      else { await fillLanguage(ctx, pkg, page.language!); await saveLanguage(ctx, page.language!); }
    } catch (e) {
      if (!(e instanceof Stopped)) ctx.fail(`Unexpected error: ${(e as Error).message}`);
    }
    setBusy(null);
    const fails = ctx.records.filter((r) => r.status === 'fail');
    const oks = ctx.records.filter((r) => r.status === 'ok').length;
    setResult(fails.length
      ? { text: <><span className="ok-text">✓ {oks}</span> · <span className="bad-text">✗ {fails.length}</span></>, tone: 'bad', fails }
      : { text: `Done · ${AFTER[page.kind]}`, tone: 'ok', fails: [] });
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
    status = confirm.filter((s) => s.destructive || s.warn).map((s) => s.text.replace(/^Replace /, '')).join(', ');
    tone = 'bad'; icon = 'error';
    const label = page.kind === 'listings' ? 'Fill & save drafts' : page.kind === 'packages' ? 'Upload' : page.kind === 'language' ? 'Replace & save' : 'Replace';
    main = <><button className="btn danger" onClick={run}><Icon name="autofill" /><span>{label}</span></button><button className="btn ghost" onClick={() => setConfirm(null)}><span>Cancel</span></button></>;
  } else if (result) { status = result.text; tone = result.tone ?? ''; icon = tone === 'bad' ? 'error' : 'check'; }
  else if (local && pkg) {
    if (page.kind === 'other') status = <><b>{pkg.name}</b>: open Packages, Properties, Privacy or Store listings</>;
    else if (fillable(page) && !plan(pkg, page).length) status = `Nothing to autofill on ${pageName(page)}`;
    else if (fillable(page)) {
      status = <><b>{pkg.name}</b> · {pageName(page)} ready</>;
      const label = page.kind === 'packages' ? 'Upload package' : page.kind === 'listings' ? 'Fill all languages' : page.kind === 'language' ? `Fill ${page.language}` : 'Autofill';
      main = <button className="btn" onClick={requestRun}><Icon name={page.kind === 'packages' ? 'upload' : 'autofill'} /><span>{label}</span></button>;
    }
  }
  else if (connected === false) status = 'Connect Extension Tower in the CWSAgent popup, or drop a meta folder here';
  else if (!linked && pending) {
    status = page.productId ? <>Link <b>{pending.name}</b> to this Edge item?</> : <>Open <b>{pending.name}</b> to link it</>;
    if (page.productId) main = <button className="btn" onClick={link}><Icon name="check" /><span>Link</span></button>;
  } else if (!linked) status = 'Choose Edge for an extension in the CWSAgent popup';
  else if (!pkg) { status = <>In Extension Tower: <b>{linked.name}</b></>; }
  else if (page.kind === 'listings') status = 'Open a language’s Edit details';
  else if (page.kind === 'other') status = 'Open Store listings, Properties or Privacy';
  else if (fillable(page) && !plan(pkg, page).length) status = `Nothing to autofill on ${pageName(page)}`;
  else if (fillable(page)) {
    status = `${pageName(page)} ready`;
    main = <button className="btn" onClick={requestRun}><Icon name="autofill" /><span>Autofill</span></button>;
  }
  const syncButton = linked && !local && !busy && !confirm && (
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
        <div className={`drop ${tone} ${over ? 'over' : ''}`} role="status" aria-live="polite"
          title="Drop a meta folder (with store/publish.json) or a listing ZIP"
          onClick={() => !busy && (!linked || local) && dirInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <Icon name={icon} />
          <div className="status wrapText">{status}</div>
        </div>
        {(main || syncButton) && <div className="buttons">{main}{!confirm && syncButton}</div>}
        {local && pkg && !busy && pkg.publish!.manual.some((m) => m.store === 'edge') && (
          <div className="fails muted">{pkg.publish!.manual.filter((m) => m.store === 'edge').map((m, i) => <div key={i}>You: {m.step}</div>)}</div>
        )}
        {result?.fails.length ? <div className="fails">{result.fails.slice(0, 5).map((f, i) => <div key={i} className="bad-text">{f.text}</div>)}</div> : null}
      </div>
      <input ref={dirInput} type="file" hidden {...{ webkitdirectory: '' }}
        onChange={(e) => { const f = e.target.files!; drop(() => filesFromInput(f), f[0]?.webkitRelativePath.split('/')[0]); e.target.value = ''; }} />
    </div>
  );
}
