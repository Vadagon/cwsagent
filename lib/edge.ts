// Drives Microsoft Partner Center's Edge pages: Properties, Privacy and one
// language's Store listing details. Values are written the way a user would
// and read back. Nothing is saved, submitted or published, and the data-use
// certifications are never ticked: the user presses Save themselves.
//
// Partner Center differs from the Chrome console: every image belongs to a
// language (there are no global ones), uploads take PNG only, each language
// is edited and saved on its own page, and Privacy is built from web
// components whose fields sit in shadow roots.
import { clean, sleep, waitFor, withCount } from './dashboard';
import { DATA_TYPES } from './reader';
import { store } from './store';
import type { DataTypeKey, Package, PlanStep, RunContext } from './types';

export type EdgeKind = 'packages' | 'properties' | 'privacy' | 'listings' | 'language' | 'other';
export interface EdgePage { kind: EdgeKind; productId: string | null; language: string | null }

export function edgePage(): EdgePage {
  const m = location.pathname.match(/\/microsoftedge\/([0-9a-f]{8}-[0-9a-f-]{27})\/([^/]+)/i);
  const productId = m?.[1]?.toLowerCase() ?? null;
  const section = m?.[2] ?? '';
  if (section === 'packages' || section === 'properties' || section === 'privacy') return { kind: section, productId, language: null };
  if (section === 'listings') {
    const language = clean(document.querySelector('h1')?.textContent).match(/^Details for (.+)$/)?.[1] ?? null;
    return { kind: language ? 'language' : 'listings', productId, language };
  }
  return { kind: 'other', productId, language: null };
}

export const SAVE_LABEL: Record<'properties' | 'privacy' | 'language', string> = {
  properties: 'Save & Continue', privacy: 'Save & Continue', language: 'Save draft',
};

// ---- Languages: Partner Center shows English names ------------------------------

const ALIASES: Record<string, string> = { kiswahili: 'sw', norwegian: 'nb', filipino: 'fil', 'chinese (china)': 'zh_CN', 'chinese (taiwan)': 'zh_TW' };
const names = new Intl.DisplayNames(['en'], { type: 'language' });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z()]/g, '');

/** The package language for a Partner Center language name, if the package has one. */
export function packageLanguage(pkg: Package, name: string): string | null {
  const named = Object.entries(pkg.languages).find(([, l]) => l.edgeName && norm(l.edgeName) === norm(name));
  return named?.[0] ?? languageCode(name, Object.keys(pkg.languages)) ?? (/^English/.test(name) && pkg.languages.en ? 'en' : null);
}

export function languageCode(name: string, codes: string[]): string | null {
  const alias = ALIASES[name.toLowerCase()];
  if (alias) return codes.find((c) => c.toLowerCase() === alias.toLowerCase() || c.split('_')[0] === alias) ?? null;
  return codes.find((c) => {
    try { return norm(names.of(c.replace(/_/g, '-')) ?? '') === norm(name); } catch { return false; }
  }) ?? codes.find((c) => {
    // "Portuguese" for pt_PT/pt; region-less names match the bare language.
    try { return !c.includes('_') && norm(names.of(c) ?? '') === norm(name); } catch { return false; }
  }) ?? null;
}

// ---- Writing fields ----------------------------------------------------------------

type TextField = HTMLInputElement | HTMLTextAreaElement;

function setNative(el: TextField, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  el.focus();
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  el.blur();
}

async function write(ctx: RunContext, find: () => TextField | null | undefined, value: string, name: string) {
  const el = find();
  if (!el) return ctx.fail(`${name}: field not found`, value);
  setNative(el, value);
  await sleep(80);
  if (find()?.value === value) ctx.ok(name);
  else ctx.fail(`${name}: the page didn't keep the value`, value);
}

const field = (selector: string, label: string) =>
  [...document.querySelectorAll<TextField>(selector)].find((el) => clean(el.getAttribute('aria-label')).toLowerCase() === label.toLowerCase());

/** The text box inside a Partner Center web component (v6_he-text-area / -text-field), by its aria-label. */
function component(label: string | RegExp): TextField | null {
  const host = [...document.querySelectorAll<HTMLElement>('v6_he-text-area, v6_he-text-field')].find((h) => {
    const l = clean(h.getAttribute('aria-label'));
    return typeof label === 'string' ? l.toLowerCase() === label.toLowerCase() : label.test(l);
  });
  return host?.shadowRoot?.querySelector<TextField>('textarea, input') ?? null;
}

// ---- Properties --------------------------------------------------------------------

const EDGE_CATEGORIES: Record<string, string> = {
  communication: 'Communication', developertools: 'Developer Tools', education: 'Productivity', tools: 'Productivity',
  workflowandplanning: 'Productivity', functionalityandui: 'Productivity', household: 'Productivity', artanddesign: 'Photos',
  entertainment: 'Entertainment', games: 'Entertainment', justforfun: 'Entertainment', newsandweather: 'News And Weather',
  shopping: 'Shopping', socialnetworking: 'Social', social: 'Social', accessibility: 'Accessibility',
  blogging: 'Blogging', photos: 'Photos', productivity: 'Productivity', searchtools: 'Search Tools', sports: 'Sports',
};
const categoryKey = (s: string) => s.toLowerCase().replace(/^category_(extensions_)?/, '').replace(/&/g, 'and').replace(/[^a-z]/g, '');

const edgeCategory = (d: Package['details']) => d.edgeCategory ?? (d.category ? EDGE_CATEGORIES[categoryKey(d.category)] : undefined);

export function planProperties(pkg: Package): PlanStep[] {
  const d = pkg.details;
  return [
    d.category && { text: `Category → ${edgeCategory(d) ?? `${d.category} (no Edge match)`}` },
    d.homepageUrl && { text: 'Website' },
    d.supportUrl && { text: 'Support contact' },
    d.matureContent !== undefined && { text: 'Mature content' },
  ].filter(Boolean) as PlanStep[];
}

export async function fillProperties(ctx: RunContext, pkg: Package) {
  const d = pkg.details;
  if (d.category || d.edgeCategory) {
    const want = edgeCategory(d);
    const select = document.querySelector<HTMLSelectElement>('select');
    const option = select && [...select.options].find((o) => categoryKey(clean(o.text)) === categoryKey(want ?? ''));
    if (!want) ctx.skip(`Category: “${d.category}” has no Edge category`);
    else if (!select || !option) ctx.fail(`Category: “${want}” not found`);
    else {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
      if (select.value === option.value) ctx.ok(`Category → ${want}`); else ctx.fail('Category did not change');
    }
  }
  ctx.check();
  if (d.homepageUrl) await write(ctx, () => field('input', 'Website'), d.homepageUrl, 'Website');
  if (d.supportUrl) await write(ctx, () => field('input', 'Support contact detail'), d.supportUrl, 'Support contact');
  if (d.matureContent !== undefined) {
    const box = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((b) => /not be suitable for all ages/i.test(b.getAttribute('aria-label') || ''));
    if (!box) ctx.fail('Mature content box not found');
    else {
      if (box.checked !== d.matureContent) box.click();
      await sleep(100);
      if (box.checked === d.matureContent) ctx.ok(`Mature content → ${d.matureContent ? 'yes' : 'no'}`); else ctx.fail('Mature content did not change');
    }
  }
}

// ---- Privacy -----------------------------------------------------------------------

export function planPrivacy(pkg: Package): PlanStep[] {
  const p = pkg.privacy;
  return [
    p.singlePurpose && { text: 'Single purpose' },
    p.permissions && { text: `${Object.keys(p.permissions).length} permission justifications` },
    p.hostPermission && { text: 'Host permission justification' },
    p.remoteCode !== undefined && { text: 'Remote code' },
    p.dataCollected && { text: 'Data usage' },
    p.privacyPolicyUrl && { text: 'Privacy policy URL' },
  ].filter(Boolean) as PlanStep[];
}

const isChecked = (host: HTMLElement) => host.getAttribute('aria-checked') === 'true' || host.hasAttribute('checked')
  || !!host.shadowRoot?.querySelector<HTMLInputElement>('input')?.checked;

export async function fillPrivacy(ctx: RunContext, pkg: Package) {
  const p = pkg.privacy;
  if (p.singlePurpose) await write(ctx, () => component('Single purpose description'), p.singlePurpose, 'Single purpose');
  for (const [perm, why] of Object.entries(p.permissions ?? {})) {
    ctx.check();
    if (component(`${perm} justification`)) await write(ctx, () => component(`${perm} justification`), why, `${perm} justification`);
    else ctx.skip(`${perm}: the uploaded package doesn't request it`);
  }
  if (p.hostPermission) {
    if (component('Host permission justification')) await write(ctx, () => component('Host permission justification'), p.hostPermission, 'Host permission justification');
    else ctx.skip('Host permission: the uploaded package requests none');
  }
  if (p.remoteCode !== undefined) {
    const radio = document.querySelector<HTMLElement>(`v6_he-radio[value="${p.remoteCode ? 'yes' : 'no'}"]`);
    if (!radio) ctx.fail('Remote code options not found');
    else {
      if (!isChecked(radio)) radio.click();
      await sleep(200);
      if (isChecked(radio)) ctx.ok(`Remote code → ${p.remoteCode ? 'yes' : 'no'}`); else ctx.fail('Remote code choice did not change');
    }
    if (p.remoteCode && p.remoteCodeJustification) await write(ctx, () => component('Justification'), p.remoteCodeJustification, 'Remote code justification');
  }
  if (p.dataCollected) {
    const want = new Set<DataTypeKey>(p.dataCollected);
    const boxes = [...document.querySelectorAll<HTMLElement>('v6_he-checkbox')];
    let wrong = 0;
    for (const [key, label] of Object.entries(DATA_TYPES) as [DataTypeKey, string][]) {
      const box = boxes.find((b) => clean(b.textContent).startsWith(label));
      if (!box) { wrong++; continue; }
      if (isChecked(box) !== want.has(key)) { box.click(); await sleep(80); }
      if (isChecked(box) !== want.has(key)) wrong++;
    }
    if (wrong) ctx.fail(`Data usage: ${wrong} checkbox(es) not set`);
    else ctx.ok(`Data collected → ${p.dataCollected.length ? p.dataCollected.map((k) => DATA_TYPES[k]).join(', ') : 'none'}`);
  }
  if (p.privacyPolicyUrl) await write(ctx, () => component(/^Privacy policy URL/), p.privacyPolicyUrl, 'Privacy policy URL');
  ctx.info('Tick the data-use certifications yourself.');
}

// ---- One language's Store listing ------------------------------------------------------

type Slot = 'logo' | 'smallTile' | 'screenshots' | 'marquee';
const SECTION: Record<Slot, string> = {
  logo: 'Extension logo', smallTile: 'Small promotional tile', screenshots: 'Screenshot/s', marquee: 'Large promotional tile',
};
const MAX_SHOTS = 6;

/** What the open language page would get from the package. */
export function languageWork(pkg: Package, name: string) {
  const code = packageLanguage(pkg, name);
  const lang = code ? pkg.languages[code] : undefined;
  const images: Partial<Record<Slot, string[]>> = {};
  const logo = pkg.images.edgeLogo ?? pkg.images.icon;
  if (logo) images.logo = [logo];
  if (pkg.images.smallTile) images.smallTile = [pkg.images.smallTile];
  if (pkg.images.marquee) images.marquee = [pkg.images.marquee];
  const shots = lang?.screenshots ?? pkg.images.screenshots;
  if (shots.length) images.screenshots = shots.slice(0, MAX_SHOTS);
  return { code, description: lang?.description, video: lang?.promoVideo ?? pkg.details.promoVideo, terms: lang?.searchTerms, images };
}

export function planLanguage(pkg: Package, name: string): PlanStep[] {
  const w = languageWork(pkg, name);
  return [
    w.description && { text: 'Description' },
    w.video && { text: 'YouTube video' },
    w.terms && { text: `Search terms: ${w.terms.join(', ')}` },
    ...(Object.keys(w.images) as Slot[]).map((slot) => ({ text: `Replace ${SECTION[slot].toLowerCase()}`, destructive: true })),
    { text: 'Save draft', warn: true },
  ].filter(Boolean) as PlanStep[];
}

/** The smallest block holding a section's title and its images or upload control. */
function section(slot: Slot): HTMLElement | null {
  // Partner Center: <section> … <span id="Extension logo_header_section">Extension logo<span> *</span>
  const header = document.getElementById(`${SECTION[slot]}_header_section`)?.closest<HTMLElement>('section');
  if (header) return header;
  const title = [...document.querySelectorAll<HTMLElement>('b, strong, label, span, div')]
    .find((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent) === SECTION[slot]));
  let box = title?.parentElement ?? null;
  for (let i = 0; box && i < 8; i++, box = box.parentElement) {
    const others = (Object.values(SECTION) as string[]).filter((t) => t !== SECTION[slot] && box!.innerText.includes(t));
    if (others.length) return null;
    if (box.querySelector('input[type="file"]') || deleteButtons(box).length) return box;
  }
  return null;
}

/**
 * A section's upload control. The screenshots section has none of its own: its
 * control sits outside every image section.
 */
function fileInput(slot: Slot): HTMLInputElement | null {
  const own = section(slot)?.querySelector<HTMLInputElement>('input[type="file"]');
  if (own || slot !== 'screenshots') return own ?? null;
  const others = (['logo', 'smallTile', 'marquee'] as Slot[]).map(section);
  return [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((i) => !others.some((o) => o?.contains(i))) ?? null;
}

// Logo and tiles: aria-label "Delete"; screenshots: "Delete screenshot shot-en.png".
const deleteButtons = (box: HTMLElement | null) => [...(box?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  .filter((b) => /^Delete( screenshot\b.*)?$/.test(clean(b.innerText || b.getAttribute('aria-label'))));

/**
 * Answers Partner Center's "Delete promotional tile … Are you sure you want to
 * proceed with deleting …?" dialog with Confirm. Its buttons may sit in shadow roots.
 */
async function confirmIfAsked() {
  const shown = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
  const buttons = (root?: Element) => deepAll<HTMLElement>('button, [role="button"], v6_he-button', root).filter(shown);
  const label = (b: HTMLElement) => clean(b.innerText || b.textContent);
  const confirm = await waitFor(() => {
    const dialogs = deepAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')
      .filter((d) => shown(d) && /are you sure|delete|remove/i.test(d.innerText || d.textContent || ''));
    if (!dialogs.length && !/Are you sure you want to proceed with deleting/i.test(document.body.innerText)) return null;
    // "Confirm" is the dialog's own; a bare "Delete" may be an image's button behind it.
    return buttons().find((b) => /^confirm$/i.test(label(b)))
      ?? dialogs.flatMap((d) => buttons(d)).find((b) => /^(delete|remove|ok|yes)$/i.test(label(b))) ?? null;
  }, { timeout: 3000 });
  if (!confirm) return;
  for (const type of ['mousedown', 'mouseup']) confirm.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
  confirm.click();
  await waitFor(() => !/Are you sure you want to proceed with deleting/i.test(document.body.innerText), { timeout: 3000 });
}

/** Partner Center takes PNG only. */
async function asPng(blob: Blob, name: string) {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  if (head[0] === 0x89 && head[1] === 0x50) { bitmap.close(); return { file: new File([blob], name, { type: 'image/png' }), ...size }; }
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { file: new File([await canvas.convertToBlob({ type: 'image/png' })], name.replace(/\.jpe?g$/i, '.png'), { type: 'image/png' }), ...size };
}

/** Removes a section's current images, one at a time: each delete may ask to confirm. */
async function clearImages(ctx: RunContext, slot: Slot) {
  const find = () => section(slot);
  if (!find()) { ctx.fail(`${SECTION[slot]}: section not found`); return false; }
  for (let guard = 0; guard < MAX_SHOTS + 2; guard++) {
    const box = find();
    const btn = box && deleteButtons(box)[0];
    if (!btn) return true;
    const before = deleteButtons(box).length;
    btn.click();
    await confirmIfAsked();
    if (!(await waitFor(() => deleteButtons(find()).length < before, { timeout: 8000 }))) {
      ctx.fail(`${SECTION[slot]}: couldn't remove an existing image`);
      return false;
    }
  }
  return true;
}

/**
 * Hands a section all of its files, in one go when its control takes several,
 * then waits for Partner Center to show them. Sections upload side by side.
 */
async function uploadImages(ctx: RunContext, slot: Slot, paths: string[], blobs: Record<string, Blob>) {
  const label = SECTION[slot];
  const find = () => section(slot);
  const missing = paths.filter((p) => !blobs[p]);
  for (const p of missing) ctx.fail(`${label}: ${p} missing from the package`);
  const files = await Promise.all(paths.filter((p) => blobs[p]).map((p) => asPng(blobs[p]!, p.split('/').pop()!).then((i) => i.file)));
  const send = async (batch: File[]) => {
    const input = await waitFor(() => fileInput(slot), { timeout: 8000 });
    if (!input) return false;
    const before = deleteButtons(find()).length;
    const dt = new DataTransfer();
    for (const f of batch) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return !!(await waitFor(() => deleteButtons(find()).length >= before + batch.length, { timeout: 120000, every: 300 }));
  };
  const input = fileInput(slot);
  let ok = true;
  if (input?.multiple || files.length === 1) ok = await send(files);
  else for (const f of files) { ctx.check(); if (!(await send([f]))) { ok = false; break; } }
  const placed = deleteButtons(find()).length;
  if (ok && !missing.length) ctx.ok(`${label}: ${placed} image${placed > 1 ? 's' : ''}`);
  else if (!ok) ctx.fail(`${label}: ${placed} of ${files.length} uploaded`);
}

export async function fillLanguage(ctx: RunContext, pkg: Package, name: string) {
  const w = languageWork(pkg, name);
  if (!w.code) return ctx.skip(`${name}: not in the package`);
  if (w.video) await write(ctx, () => field('input', 'YouTube video URL'), w.video, 'YouTube video');
  if (w.terms) await addSearchTerms(ctx, w.terms);
  // Clear every section first, then start all uploads together and wait for them.
  const slots = (['logo', 'smallTile', 'screenshots', 'marquee'] as Slot[]).filter((slot) => w.images[slot]);
  const ready: Slot[] = [];
  for (const slot of slots) {
    ctx.check();
    if (await clearImages(ctx, slot)) ready.push(slot);
  }
  const count = ready.reduce((n, slot) => n + w.images[slot]!.length, 0);
  if (count) ctx.progress(`Uploading ${count} images…`);
  await Promise.all(ready.map((slot) => uploadImages(ctx, slot, w.images[slot]!, pkg.blobs)));
  // Last, so nothing the page re-renders during uploads can reset it.
  if (w.description) {
    if (/\bChrome\b/.test(w.description)) ctx.info('The description mentions Chrome; Edge asks not to reference other browsers.');
    if (w.description.length > 10000) ctx.fail(`Description: ${w.description.length} characters, Edge allows 10,000`, w.description);
    else {
      await waitFor(description, { timeout: 15000 });
      await sleep(500);
      await write(ctx, description, w.description, 'Description');
    }
  }
}

/** Presses Save draft on a language page and waits for the save to finish. */
export async function saveLanguage(ctx: RunContext, name: string) {
  const save = pageButtonEdge(/^Save draft$/i);
  if (!save) { ctx.fail(`${name}: Save draft not found`); return false; }
  save.click();
  await sleep(1500);
  await waitFor(() => !/\bSaving\b/.test(document.body.innerText), { timeout: 30000 });
  return true;
}

const description = () => document.querySelector<HTMLTextAreaElement>('textarea[id*="description"]');

// ---- Search terms ------------------------------------------------------------------

/** The block under the "Search terms" title, with its inputs and the Add Term link. */
function termsSection(): HTMLElement | null {
  const title = [...document.querySelectorAll<HTMLElement>('b, strong, label, span, div, h2, h3')]
    .find((el) => el.children.length === 0 && /^Search terms\b/i.test(clean(el.textContent)));
  let box = title?.parentElement ?? null;
  for (let i = 0; box && i < 6; i++, box = box.parentElement) {
    if (box.querySelector('input[type="text"], input:not([type])')) return box;
  }
  return null;
}
const termInputs = (box: HTMLElement) => [...box.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')];
const addTermLink = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>('a, button')].find((b) => /^Add term$/i.test(clean(b.textContent)));
const termsNow = (box: HTMLElement) => {
  const values = termInputs(box).map((i) => i.value.trim().toLowerCase()).filter(Boolean);
  const lines = box.innerText.split('\n').map((l) => clean(l).toLowerCase());
  return (t: string) => values.includes(t.toLowerCase()) || lines.includes(t.toLowerCase());
};

/** Adds the terms Partner Center doesn't show yet; existing terms are kept. */
async function addSearchTerms(ctx: RunContext, terms: string[]) {
  const box = termsSection();
  if (!box) return ctx.fail('Search terms: section not found', terms.join('\n'));
  let added = 0;
  for (const term of terms) {
    ctx.check();
    if (termsNow(box)(term)) continue;
    let input = termInputs(box).find((i) => !i.value.trim());
    if (!input) {
      const link = addTermLink(box);
      if (!link) { ctx.fail(`Search terms: no room for “${term}”`, term); continue; }
      link.click();
      input = (await waitFor(() => termInputs(box).find((i) => !i.value.trim()), { timeout: 3000 })) ?? undefined;
      if (!input) { ctx.fail(`Search terms: no field for “${term}”`, term); continue; }
    }
    // Partner Center keeps a typed term only once Add Term is pressed, the last one included.
    // Angular sometimes misses the first input event, so type and press again once.
    let kept = false;
    for (let attempt = 0; attempt < 2 && !kept; attempt++) {
      setNative(input, term);
      await sleep(attempt ? 400 : 120);
      const link = addTermLink(box);
      if (link) { link.click(); await sleep(attempt ? 800 : 300); }
      kept = termsNow(box)(term);
      if (!kept) input = termInputs(box).find((i) => !i.value.trim() || i.value.trim() === term) ?? input;
    }
    if (kept) added++; else ctx.fail(`Search terms: “${term}” not kept`, term);
  }
  ctx.ok(`Search terms: ${added} added, ${terms.length - added} already there or failed`);
}

// ---- Package -------------------------------------------------------------------------

/** Every element matching selector, including inside Partner Center's shadow roots. */
function deepAll<T extends Element>(selector: string, root: Document | ShadowRoot | Element = document): T[] {
  const out = [...root.querySelectorAll<T>(selector)];
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...deepAll<T>(selector, el.shadowRoot));
  return out;
}

export const planPackage = (pkg: Package): PlanStep[] =>
  pkg.publish?.packageZip ? [{ text: `Upload package${pkg.publish.version ? ` v${pkg.publish.version}` : ''}`, destructive: true }] : [];

/** Puts the release ZIP into the Packages page's upload control. Partner Center then validates it. */
export async function uploadPackage(ctx: RunContext, pkg: Package) {
  const path = pkg.publish?.packageZip;
  const blob = path && pkg.blobs[path];
  if (!blob) return ctx.skip('No package ZIP in the drop');
  const zipInput = () => deepAll<HTMLInputElement>('input[type="file"]').find((i) => !i.accept || /zip/i.test(i.accept));
  if (!zipInput()) {
    deepAll<HTMLElement>('button, a, v6_he-button').find((b) => /^(Replace|Upload( a)?( new)? package|Browse)/i.test(clean(b.textContent)))?.click();
  }
  const input = await waitFor(zipInput, { timeout: 8000 });
  if (!input) return ctx.fail('Package: upload control not found; drop the ZIP on the page yourself');
  const dt = new DataTransfer();
  dt.items.add(new File([blob], path.split('/').pop()!, { type: 'application/zip' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  ctx.progress('Partner Center is validating the package…');
  const done = await waitFor(() => /validat(ing|ion in progress)|uploading/i.test(document.body.innerText) ? null : true, { timeout: 180000, every: 2000 });
  const error = deepAll<HTMLElement>('[role="alert"], .error, .ms-MessageBar--error').map((e) => clean(e.textContent)).find(Boolean);
  if (error) ctx.fail(`Package: ${error}`);
  else if (done) ctx.ok(`Package${pkg.publish?.version ? ` v${pkg.publish.version}` : ''} uploaded; check the languages and permissions it shows`);
  else ctx.fail('Package: still validating after 3 minutes; check the page');
}

// ---- Every language, one after another ---------------------------------------------------

const RUN_KEY = 'edge-run';
interface RunState { productId: string; loadedAt: number; done: string[] }

/** Languages on the Store listings table, with each row's Edit details control. */
function listingRows() {
  return [...document.querySelectorAll<HTMLElement>('a, button')]
    .filter((b) => /^Edit details$/i.test(clean(b.textContent)))
    .map((edit) => {
      const row = edit.closest<HTMLElement>('tr, [role="row"]');
      const cells = row ? [...row.querySelectorAll<HTMLElement>('td, th, [role="cell"], [role="gridcell"], [role="rowheader"]')] : [];
      const texts = cells.map((c) => clean(c.innerText));
      const name = texts.find((t) => t && !/^(Edit details|Complete|Incomplete|In progress)$/i.test(t)) ?? '';
      // The status cell carries an icon, so read the row's text rather than an exact cell.
      const rowText = clean(row?.innerText);
      const incomplete = /\b(Incomplete|In progress)\b/i.test(rowText);
      return { name, edit, incomplete, complete: !incomplete && /\bComplete\b/i.test(rowText) };
    })
    .filter((r) => r.name);
}

const pageButtonEdge = (text: RegExp) =>
  deepAll<HTMLElement>('button, v6_he-button').find((b) => text.test(clean(b.textContent)) && !(b as HTMLButtonElement).disabled);

/** Store listings is showing: its route, no details heading, and its table. */
const onListings = () => /\/listings\/?$/.test(location.pathname) && edgePage().kind === 'listings';

export function planAllLanguages(pkg: Package): PlanStep[] {
  const rows = listingRows();
  const ours = rows.filter((r) => packageLanguage(pkg, r.name));
  return [
    { text: `${ours.length} of ${rows.length} languages: description, search terms, logo, tiles, screenshots`, destructive: true },
    { text: 'Each language is saved as a draft, then closed. Failed or Incomplete languages are filled again, up to 3 passes. Nothing is published.', warn: true },
  ];
}

/** Opens one language's details page from Store listings, retrying when Partner Center doesn't go there. */
async function openLanguage(ctx: RunContext, name: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    ctx.check();
    // Edit details navigates relative to the listings route: press it only once
    // Partner Center has fully settled back on Store listings.
    const row = await waitFor(() => onListings() && listingRows().find((r) => r.name === name), { timeout: 20000 });
    if (!row) {
      if (edgePage().kind === 'language') await closeLanguage();
      continue;
    }
    await sleep(1000 * attempt);
    row.edit.click();
    if (await waitFor(() => edgePage().kind === 'language' && edgePage().language === name, { timeout: 30000 })) return true;
    ctx.progress(`${name}: details page didn't open, trying again (${attempt + 1}/3)…`);
    // A wrong language page or a half-loaded one: go back to the list first.
    if (edgePage().kind === 'language') await closeLanguage();
  }
  return false;
}

/** Presses Close until Store listings shows again. Close sometimes ignores the first click after saving. */
async function closeLanguage() {
  for (let i = 0; i < 6; i++) {
    if (edgePage().kind === 'language') pageButtonEdge(/^Close$/i)?.click();
    if (await waitFor(() => onListings() && listingRows().length > 0, { timeout: 10000 })) return true;
  }
  return false;
}

const MAX_PASSES = 3;

/**
 * Opens every language on Store listings, fills it, presses Save draft and Close.
 * Then goes round again for any language that failed or that Partner Center still
 * marks Incomplete, up to three passes. Languages finished earlier with the same
 * drop are skipped unless the table shows them Incomplete.
 */
export async function fillAllLanguages(ctx: RunContext, pkg: Package, productId: string) {
  const saved = await store.get<RunState>(RUN_KEY).catch(() => undefined);
  const state: RunState = saved && saved.productId === productId && saved.loadedAt === pkg.loadedAt ? saved : { productId, loadedAt: pkg.loadedAt, done: [] };
  const rows = listingRows();
  if (!rows.length) return ctx.fail('Store listings: no languages found');
  for (const r of rows) if (!packageLanguage(pkg, r.name)) ctx.skip(`${r.name}: not in the package`);
  const names = rows.map((r) => r.name).filter((name) => packageLanguage(pkg, name));
  const base = ctx;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    // Done means filled without problems here and shown Complete on the table.
    const incomplete = new Set(listingRows().filter((r) => r.incomplete).map((r) => r.name));
    const todo = names.filter((name) => !state.done.includes(name) || incomplete.has(name));
    if (!todo.length) break;
    if (pass === 1) { for (const name of names) if (!todo.includes(name)) ctx.skip(`${name}: done earlier`); }
    else ctx.info(`Pass ${pass}: filling ${todo.length} incomplete or failed language${todo.length === 1 ? '' : 's'} again`);
    for (const [i, name] of todo.entries()) {
      ctx.check();
      ctx = withCount(base, `${pass > 1 ? `Pass ${pass} · ` : ''}${i + 1}/${todo.length} languages`);
      ctx.progress(`${name}: opening…`);
      if (!(await openLanguage(ctx, name))) { ctx.fail(`${name}: details page didn't open`); continue; }
      await sleep(800);
      const before = ctx.records.filter((r) => r.status === 'fail').length;
      await fillLanguage(ctx, pkg, name);
      const failed = ctx.records.filter((r) => r.status === 'fail').length > before;
      if (!(await saveLanguage(ctx, name))) return;
      if (!(await closeLanguage())) { ctx.fail(`${name}: saved, but the page didn't close`); return; }
      state.done = state.done.filter((n) => n !== name);
      if (!failed) {
        state.done.push(name);
        ctx.ok(`${name}: saved as draft`);
      } else ctx.info(`${name}: saved with problems above; tried again in the next pass`);
      await store.set(RUN_KEY, state).catch(() => {});
      await sleep(800);
    }
  }
  ctx = base;
  const still = listingRows().filter((r) => r.incomplete && names.includes(r.name)).map((r) => r.name);
  if (still.length) ctx.fail(`Still incomplete after ${MAX_PASSES} passes: ${still.join(', ')}`);
}

// ---- Finding a product for Extension Tower -------------------------------------------

export const isOverview = (path = location.pathname) => /\/dashboard\/microsoftedge\/overview\/?$/.test(path);

function productRows() {
  const seen = new Set<string>();
  return [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/microsoftedge/"]')].flatMap((a) => {
    const id = a.getAttribute('href')?.match(/\/microsoftedge\/([0-9a-f]{8}-[0-9a-f-]{27})\/packages/i)?.[1]?.toLowerCase();
    const name = clean(a.innerText);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, href: `${location.origin}${location.pathname.replace(/overview\/?$/, '')}${id}/listings` }];
  });
}

/** Product IDs on the overview as it is now. */
export const listedProducts = () => productRows().map((r) => r.id);

/** Waits for the overview's product list, then matches the extension by name. */
export async function findProduct(name: string, match: <T>(n: string, items: T[], of: (i: T) => string) => T | null) {
  const loaded = await waitFor(() => productRows().length > 0 || /Create new extension/.test(document.body.innerText), { timeout: 20000 });
  if (!loaded) return null;
  await sleep(500); // the table fills in after the create button appears
  return match(name, productRows(), (r) => r.name);
}

export const createButton = () =>
  [...document.querySelectorAll<HTMLElement>('v6_he-button, button')].find((b) => /^Create new extension$/.test(clean(b.textContent)));
