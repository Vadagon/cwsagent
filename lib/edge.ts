// Drives Microsoft Partner Center's Edge pages: Properties, Privacy and one
// language's Store listing details. Values are written the way a user would
// and read back. Nothing is saved, submitted or published, and the data-use
// certifications are never ticked: the user presses Save themselves.
//
// Partner Center differs from the Chrome console: every image belongs to a
// language (there are no global ones), uploads take PNG only, each language
// is edited and saved on its own page, and Privacy is built from web
// components whose fields sit in shadow roots.
import { clean, sleep, waitFor } from './dashboard';
import { DATA_TYPES } from './reader';
import type { DataTypeKey, Package, PlanStep, RunContext } from './types';

export type EdgeKind = 'properties' | 'privacy' | 'listings' | 'language' | 'other';
export interface EdgePage { kind: EdgeKind; productId: string | null; language: string | null }

export function edgePage(): EdgePage {
  const m = location.pathname.match(/\/microsoftedge\/([0-9a-f]{8}-[0-9a-f-]{27})\/([^/]+)/i);
  const productId = m?.[1]?.toLowerCase() ?? null;
  const section = m?.[2] ?? '';
  if (section === 'properties' || section === 'privacy') return { kind: section, productId, language: null };
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

export function planProperties(pkg: Package): PlanStep[] {
  const d = pkg.details;
  return [
    d.category && { text: `Category → ${EDGE_CATEGORIES[categoryKey(d.category)] ?? `${d.category} (no Edge match)`}` },
    d.homepageUrl && { text: 'Website' },
    d.supportUrl && { text: 'Support contact' },
    d.matureContent !== undefined && { text: 'Mature content' },
  ].filter(Boolean) as PlanStep[];
}

export async function fillProperties(ctx: RunContext, pkg: Package) {
  const d = pkg.details;
  if (d.category) {
    const want = EDGE_CATEGORIES[categoryKey(d.category)];
    const select = document.querySelector<HTMLSelectElement>('select');
    const option = select && [...select.options].find((o) => clean(o.text).toLowerCase() === want?.toLowerCase());
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
  const code = languageCode(name, Object.keys(pkg.languages)) ?? (/^English/.test(name) ? 'en' : null);
  const lang = code ? pkg.languages[code] : undefined;
  const images: Partial<Record<Slot, string[]>> = {};
  if (pkg.images.icon) images.logo = [pkg.images.icon];
  if (pkg.images.smallTile) images.smallTile = [pkg.images.smallTile];
  if (pkg.images.marquee) images.marquee = [pkg.images.marquee];
  const shots = lang?.screenshots ?? pkg.images.screenshots;
  if (shots.length) images.screenshots = shots.slice(0, MAX_SHOTS);
  return { code, description: lang?.description, video: lang?.promoVideo ?? pkg.details.promoVideo, images };
}

export function planLanguage(pkg: Package, name: string): PlanStep[] {
  const w = languageWork(pkg, name);
  return [
    w.description && { text: 'Description' },
    w.video && { text: 'YouTube video' },
    ...(Object.keys(w.images) as Slot[]).map((slot) => ({ text: `Replace ${SECTION[slot].toLowerCase()}`, destructive: true })),
  ].filter(Boolean) as PlanStep[];
}

/** The smallest block holding a section's title and its images or upload control. */
function section(slot: Slot): HTMLElement | null {
  const title = [...document.querySelectorAll<HTMLElement>('b, strong, label, span, div')]
    .find((el) => el.children.length === 0 && clean(el.textContent).replace(/\s*\*$/, '') === SECTION[slot]);
  let box = title?.parentElement ?? null;
  for (let i = 0; box && i < 8; i++, box = box.parentElement) {
    const others = (Object.values(SECTION) as string[]).filter((t) => t !== SECTION[slot] && box!.innerText.includes(t));
    if (others.length) return null;
    if (box.querySelector('input[type="file"]') || deleteButtons(box).length) return box;
  }
  return null;
}

const deleteButtons = (box: HTMLElement | null) => [...(box?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  .filter((b) => clean(b.innerText || b.getAttribute('aria-label')) === 'Delete');

async function confirmIfAsked() {
  const dialog = await waitFor(() => [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')]
    .find((d) => /delete|remove/i.test(d.innerText)), { timeout: 700 });
  [...(dialog?.querySelectorAll('button') ?? [])].find((b) => /^(delete|remove|ok|yes|confirm)$/i.test(clean(b.textContent)))?.click();
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

async function replaceImages(ctx: RunContext, slot: Slot, paths: string[], blobs: Record<string, Blob>) {
  const label = SECTION[slot];
  const find = () => section(slot);
  if (!find()) return ctx.fail(`${label}: section not found`);
  for (let guard = 0; guard < MAX_SHOTS + 2; guard++) {
    const box = find();
    const btn = box && deleteButtons(box)[0];
    if (!btn) break;
    const before = deleteButtons(box).length;
    btn.click();
    await confirmIfAsked();
    if (!(await waitFor(() => deleteButtons(find()).length < before, { timeout: 8000 }))) {
      return ctx.fail(`${label}: couldn't remove an existing image`);
    }
  }
  let placed = 0;
  for (const path of paths) {
    ctx.check();
    const blob = blobs[path];
    if (!blob) { ctx.fail(`${label}: ${path} missing from the package`); continue; }
    const input = await waitFor(() => find()?.querySelector<HTMLInputElement>('input[type="file"]'), { timeout: 8000 });
    if (!input) { ctx.fail(`${label}: no upload control`); break; }
    const img = await asPng(blob, path.split('/').pop()!);
    const before = deleteButtons(find()).length;
    const dt = new DataTransfer();
    dt.items.add(img.file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (await waitFor(() => deleteButtons(find()).length > before, { timeout: 60000, every: 300 })) placed++;
    else ctx.fail(`${label}: ${img.file.name} did not upload`);
    await sleep(300);
  }
  if (placed === paths.length) ctx.ok(`${label}: ${placed} image${placed > 1 ? 's' : ''}`);
}

export async function fillLanguage(ctx: RunContext, pkg: Package, name: string) {
  const w = languageWork(pkg, name);
  if (!w.code) return ctx.skip(`${name}: not in the package`);
  if (w.description) {
    if (/\bChrome\b/.test(w.description)) ctx.info('The description mentions Chrome; Edge asks not to reference other browsers.');
    if (w.description.length > 10000) ctx.fail(`Description: ${w.description.length} characters, Edge allows 10,000`, w.description);
    else await write(ctx, () => document.querySelector<HTMLTextAreaElement>('textarea[id*="description"]'), w.description, 'Description');
  }
  if (w.video) await write(ctx, () => field('input', 'YouTube video URL'), w.video, 'YouTube video');
  for (const slot of ['logo', 'smallTile', 'screenshots', 'marquee'] as Slot[]) {
    const paths = w.images[slot];
    if (!paths) continue;
    ctx.check();
    ctx.progress(`Uploading ${SECTION[slot].toLowerCase()}…`);
    await replaceImages(ctx, slot, paths, pkg.blobs);
  }
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
