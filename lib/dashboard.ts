// Drives the developer console's own form controls: labels, roles and the
// console's upload widgets, as seen on the live console on 2026-10-19. Never
// presses Save/Submit/Publish, never ticks the data-use certifications, never
// touches distribution.
import { DATA_TYPES } from './reader';
import type { DataTypeKey, ListingOptions, Package, Page, PlanStep, RunContext } from './types';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitFor<T>(test: () => T, { timeout = 15000, every = 150 } = {}): Promise<T | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = test();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

export class Stopped extends Error {}

// ---- Page detection --------------------------------------------------------

export function pageKind(path = location.pathname): Page {
  const m = path.match(/\/devconsole\/[^/]+\/([a-p]{32})(\/.*)?$/);
  if (!m) return { kind: 'other' };
  const rest = m[2] || '';
  const itemId = m[1];
  if (/^\/edit\/?$|^\/edit\/listing\/?$/.test(rest)) return { kind: 'listing', itemId };
  if (/^\/edit\/privacy/.test(rest)) return { kind: 'privacy', itemId };
  if (/^\/edit\/distribution/.test(rest)) return { kind: 'distribution', itemId };
  if (/^\/testcredentials/.test(rest)) return { kind: 'test', itemId };
  const a = rest.match(/^\/analytics\/(installs|impressions|users)\/?$/);
  if (a) return { kind: a[1] as Page['kind'], itemId };
  if (/^\/ratings\/?$/.test(rest)) return { kind: 'ratings', itemId };
  if (/^\/support\/?$/.test(rest)) return { kind: 'support', itemId };
  return { kind: 'item', itemId };
}

export type TabKind = 'listing' | 'privacy' | 'test';
export type ReportKind = 'installs' | 'impressions' | 'users' | 'ratings' | 'support';

export function tabUrl(kind: TabKind | ReportKind): string | null {
  const m = location.pathname.match(/^(.*\/devconsole\/[^/]+\/[a-p]{32})/);
  if (!m) return null;
  const base = m[1];
  return {
    listing: `${base}/edit`, privacy: `${base}/edit/privacy`, test: `${base}/testcredentials`,
    installs: `${base}/analytics/installs`, impressions: `${base}/analytics/impressions`, users: `${base}/analytics/users`,
    ratings: `${base}/ratings`, support: `${base}/support`,
  }[kind];
}

export const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim();

export const itemTitle = () => clean(document.querySelector('h1')?.textContent) || null;

// ---- Finding controls by their visible label -------------------------------

export const main = (): HTMLElement => document.querySelector('main') || document.body;

export function labelOf(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  const text = ids.map((id) => (document.getElementById(id) as HTMLElement | null)?.innerText || '').join(' ');
  return clean(text || el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.[0]?.innerText || '');
}

const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || el.getClientRects().length);

export function byLabel<T extends Element = HTMLInputElement>(selector: string, match: string | RegExp): T | null {
  const test = typeof match === 'string' ? (l: string) => l.toLowerCase() === match.toLowerCase() : (l: string) => match.test(l);
  return ([...main().querySelectorAll(selector)].find((el) => visible(el) && test(labelOf(el))) as T) || null;
}

export function allByLabel<T extends Element = HTMLTextAreaElement>(selector: string, match: RegExp): T[] {
  return [...main().querySelectorAll(selector)].filter((el) => visible(el) && match.test(labelOf(el))) as T[];
}

// ---- Setting values the way a user would, then reading them back ----------

type TextField = HTMLInputElement | HTMLTextAreaElement;

function setText(el: TextField, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  el.focus();
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
}

/** Writes a text field and reports whether the page kept the exact value. */
async function writeText(ctx: RunContext, find: () => TextField | null, value: string, name: string) {
  const el = find();
  if (!el) return ctx.fail(`${name}: field not found`, value);
  setText(el, value);
  await sleep(60);
  if (find()?.value === value) ctx.ok(name);
  else ctx.fail(`${name}: the page didn't keep the value`, value);
}

async function selectOption(listLabel: string, predicate: (li: HTMLElement) => boolean): Promise<HTMLElement | null> {
  const list = document.querySelector(`ul[role="listbox"][aria-label="${listLabel}"]`);
  if (!list) return null;
  // Group headers (e.g. the "Productivity" category group) are disabled options.
  const option = [...list.querySelectorAll<HTMLElement>('li[role="option"]:not([aria-disabled="true"])')].find(predicate);
  if (!option) return null;
  const combo = byLabel<HTMLElement>('[role="combobox"]', new RegExp(`^${listLabel}\\b`, 'i'));
  combo?.click();
  await sleep(150);
  option.click();
  await sleep(250);
  const want = clean(option.innerText).toLowerCase();
  return !combo || clean(combo.innerText).toLowerCase().includes(want) ? option : null;
}

const optionLabels = (listLabel: string) => [...document.querySelectorAll<HTMLElement>(
  `ul[role="listbox"][aria-label="${listLabel}"] li[role="option"]:not([aria-disabled="true"])`)]
  .map((li) => clean(li.innerText)).filter((t) => t && !/^select/i.test(t));

export function selectValue(comboLabel: string): string | null {
  const combo = byLabel<HTMLElement>('[role="combobox"]', new RegExp(`^${comboLabel}\\b`, 'i'));
  return combo ? clean(combo.innerText).replace(new RegExp(`^${comboLabel}\\s*`, 'i'), '') : null;
}

// ---- Image uploads ---------------------------------------------------------

type UploadType = 'icon' | 'screenshot' | 'smallTile' | 'marquee';
const UPLOAD: Record<UploadType, string> = { icon: '5', screenshot: '4', smallTile: '1', marquee: '3' };

export function uploadBox(type: UploadType, global?: boolean): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[data-image-upload-type="${UPLOAD[type]}"]`)].find((el) =>
    type !== 'screenshot' ? true : (el.getAttribute('data-is-global') === 'true') === global) || null;
}

/** Smallest ancestor of the upload box that also holds its remove buttons. */
function uploadScope(box: HTMLElement): HTMLElement {
  let scope = box;
  for (let i = 0; i < 6 && scope.parentElement; i++) {
    const parent = scope.parentElement;
    if (parent.querySelectorAll('[data-image-upload-type]').length > 1) break;
    scope = parent;
    if (scope.querySelector('button[aria-label^="Remove image"]')) break;
  }
  return scope;
}

export const imageCount = (box: HTMLElement) => uploadScope(box).querySelectorAll('[data-image-key]').length
  || box.querySelectorAll('img').length;

export function boxImages(box: HTMLElement | null): HTMLImageElement[] {
  if (!box) return [];
  const keyed = uploadScope(box).querySelectorAll<HTMLImageElement>('[data-image-key] img');
  return [...(keyed.length ? keyed : box.querySelectorAll<HTMLImageElement>('img'))];
}

function pngColorType(bytes: Uint8Array): number | null {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isPng ? bytes[25] ?? null : null;
}

/** The store rejects PNGs with alpha: re-encode those as JPEG. */
async function prepareImage(blob: Blob, name: string) {
  const colorType = pngColorType(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  if (colorType !== 4 && colorType !== 6) {
    bitmap.close();
    return { file: new File([blob], name, { type: colorType !== null ? 'image/png' : 'image/jpeg' }), width, height, converted: false };
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx2d = canvas.getContext('2d')!;
  ctx2d.fillStyle = '#fff';
  ctx2d.fillRect(0, 0, width, height);
  ctx2d.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return { file: new File([jpeg], name.replace(/\.png$/i, '.jpg'), { type: 'image/jpeg' }), width, height, converted: true };
}

const SIZES: Record<UploadType, [number, number][]> = {
  icon: [[128, 128]],
  screenshot: [[1280, 800], [640, 400]],
  smallTile: [[440, 280]],
  marquee: [[1400, 560]],
};

function sizeWarning(type: UploadType, width: number, height: number) {
  const ok = SIZES[type].some(([w, h]) => w === width && h === height);
  return ok ? null : `${width}×${height}, expected ${SIZES[type].map(([w, h]) => `${w}×${h}`).join(' or ')}`;
}

function uploadError(scope: HTMLElement) {
  const m = clean(scope.innerText).match(/(Image (?:must|should|is)[^.]*\.|[^.]*(?:error|failed|invalid)[^.]*\.)/i);
  return m ? m[0] : null;
}

async function uploadImage(ctx: RunContext, box: HTMLElement, blob: Blob, name: string, type: UploadType) {
  const input = box.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('upload control not found');
  const img = await prepareImage(blob, name);
  const warn = sizeWarning(type, img.width, img.height);
  if (warn) ctx.info(`⚠︎ ${name}: ${warn}`);
  if (img.converted) ctx.info(`${name} has transparency: uploading it as JPEG`);

  const before = imageCount(box);
  const srcs = () => [...box.querySelectorAll('img')].map((i) => i.src).join('|');
  const srcBefore = srcs();
  const dt = new DataTransfer();
  dt.items.add(img.file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const done = await waitFor(() => (type === 'screenshot' ? imageCount(box) > before : srcs() !== srcBefore), { timeout: 60000, every: 300 });
  if (!done) throw new Error(uploadError(uploadScope(box)) || 'upload did not finish within 60 s');
}

async function confirmDialogIfAny() {
  const dialog = await waitFor(() => [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')]
    .find((d) => visible(d) && /remove|delete/i.test(d.innerText)), { timeout: 700 });
  const btn = dialog && [...dialog.querySelectorAll('button')].find((b) => /^(remove|delete|ok|confirm|yes)$/i.test(clean(b.innerText)));
  btn?.click();
}

async function clearScreenshots(box: HTMLElement) {
  const scope = uploadScope(box);
  for (let guard = 0; guard < 10; guard++) {
    const btn = scope.querySelector<HTMLButtonElement>('button[aria-label^="Remove image"]');
    if (!btn) return;
    const before = imageCount(box);
    btn.click();
    await confirmDialogIfAny();
    if (!(await waitFor(() => imageCount(box) < before, { timeout: 8000 }))) throw new Error('could not remove an existing screenshot');
  }
}

async function replaceScreenshots(ctx: RunContext, box: HTMLElement, paths: string[], blobs: Record<string, Blob>, label: string) {
  await clearScreenshots(box);
  for (const path of paths) {
    ctx.check();
    const blob = blobs[path];
    if (!blob) { ctx.fail(`${label}: ${path} missing from the package`); continue; }
    await uploadImage(ctx, box, blob, path.split('/').pop()!, 'screenshot');
    await sleep(300);
  }
  const count = imageCount(box);
  if (count === paths.length) ctx.ok(`${label}: ${count} screenshots`);
  else ctx.fail(`${label}: ${count} of ${paths.length} screenshots on the page`);
}

// ---- Languages ---------------------------------------------------------------

/** Console language value (pt-BR, iw) ↔ Chrome _locales code (pt_BR, he). */
export const normLocale = (code: string) => {
  const c = String(code).replace(/_/g, '-').toLowerCase();
  return c === 'he' ? 'iw' : c;
};
export const toLocalesCode = (value: string) => (value === 'iw' ? 'he' : String(value).replace(/-/g, '_'));

export function languageOptions(): string[] {
  const list = document.querySelector('ul[role="listbox"][aria-label="Language"]');
  return list ? [...list.querySelectorAll('li[role="option"]')].map((li) => li.getAttribute('data-value')).filter((v): v is string => !!v) : [];
}

export function currentLanguage(): string | null {
  const combo = byLabel<HTMLElement>('[role="combobox"]', /^Language/);
  const m = combo && clean(combo.innerText).match(/[–-]\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?)\b/);
  return m?.[1] ?? null;
}

export async function switchLanguage(value: string): Promise<boolean> {
  if (currentLanguage() === value) return true;
  const option = await selectOption('Language', (li) => li.getAttribute('data-value') === value);
  if (!option) return false;
  const ok = await waitFor(() => currentLanguage() === value, { timeout: 8000 });
  await sleep(700); // let the localized fields re-render
  return !!ok;
}

const languageValue = (code: string) => languageOptions().find((v) => normLocale(v) === normLocale(code)) || null;

// ---- Plans: what a fill will do, used to ask before replacing anything ----------

const CATEGORY_NORM = (s: string) => String(s).toLowerCase().replace(/^category_(extensions_)?/, '').replace(/&/g, 'and').replace(/[^a-z]/g, '');

export function planListing(pkg: Package, opts: ListingOptions): PlanStep[] {
  const steps: PlanStep[] = [];
  const d = pkg.details;
  if (opts.details) {
    if (d.category) steps.push({ text: `Category → ${d.category}` });
    if (d.officialUrl) steps.push({ text: `Official URL → ${d.officialUrl}` });
    if (d.homepageUrl !== undefined) steps.push({ text: `Homepage URL → ${d.homepageUrl}` });
    if (d.supportUrl !== undefined) steps.push({ text: `Support URL → ${d.supportUrl}` });
    if (d.matureContent !== undefined) steps.push({ text: `Mature content → ${d.matureContent ? 'on' : 'off'}` });
    if (d.promoVideo !== undefined) steps.push({ text: 'Global promo video' });
  }
  if (opts.images) {
    for (const [k, t] of [['icon', 'Store icon'], ['smallTile', 'Small promo tile'], ['marquee', 'Marquee promo tile']] as const) {
      if (pkg.images[k]) steps.push({ text: `${t}: replace` });
    }
    if (pkg.images.screenshots.length) {
      const box = uploadBox('screenshot', true);
      const now = box ? imageCount(box) : 0;
      steps.push({ text: `Global screenshots: remove ${now}, upload ${pkg.images.screenshots.length}`, destructive: now > 0 });
    }
  }
  const available = languageOptions();
  const langs = Object.entries(pkg.languages);
  const texts = langs.filter(([, l]) => opts.descriptions && (l.description || l.promoVideo));
  const shots = langs.filter(([, l]) => opts.localizedImages && l.screenshots?.length);
  const missing = new Set<string>();
  for (const [code] of [...texts, ...shots]) {
    if (!available.some((v) => normLocale(v) === normLocale(code))) missing.add(code);
  }
  if (texts.length) steps.push({ text: `Descriptions: ${texts.filter(([c]) => !missing.has(c)).map(([c]) => c).join(', ')}` });
  const shotLangs = shots.filter(([c]) => !missing.has(c)).map(([c]) => c);
  if (shotLangs.length) steps.push({ text: `Localized screenshots (existing ones removed): ${shotLangs.join(', ')}`, destructive: true });
  if (missing.size) steps.push({ text: `Not in this item's languages, skipped: ${[...missing].join(', ')}`, warn: true });
  return steps;
}

export function planPrivacy(pkg: Package): PlanStep[] {
  const p = pkg.privacy;
  const steps: PlanStep[] = [];
  if (p.singlePurpose) steps.push({ text: 'Single purpose' });
  const perms = Object.keys(p.permissions ?? {});
  if (perms.length) steps.push({ text: `Justifications: ${perms.join(', ')}` });
  if (p.hostPermission) steps.push({ text: 'Host permission justification' });
  if (p.remoteCode !== undefined) steps.push({ text: `Remote code → ${p.remoteCode ? 'yes' : 'no'}` });
  if (p.dataCollected) steps.push({ text: `Data collected → ${p.dataCollected.length ? p.dataCollected.map((k) => DATA_TYPES[k]).join(', ') : 'none'}` });
  if (p.privacyPolicyUrl) steps.push({ text: `Privacy policy URL → ${p.privacyPolicyUrl}` });
  steps.push({ text: 'The three certifications are highlighted for you to tick', warn: true });
  return steps;
}

export function planTest(pkg: Package): PlanStep[] {
  const labels = { username: 'Username', password: 'Password', instructions: 'Additional instructions' } as const;
  return (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => pkg.test?.[k] !== undefined).map((k) => ({ text: labels[k] }));
}

/** Number of languages in the package that this item can show. */
export function readyLanguageCount(pkg: Package): number {
  const available = languageOptions().map(normLocale);
  return Object.entries(pkg.languages).filter(([c, l]) => l.description && (!available.length || available.includes(normLocale(c)))).length;
}

// ---- Fill: Store listing ----------------------------------------------------

async function fillDetails(ctx: RunContext, pkg: Package) {
  const d = pkg.details;
  if (d.category) {
    const want = CATEGORY_NORM(d.category);
    const ok = await selectOption('Category', (li) =>
      CATEGORY_NORM(li.getAttribute('data-value') || '') === want || CATEGORY_NORM(li.innerText) === want);
    if (ok) ctx.ok(`Category → ${clean(ok.innerText)}`);
    else ctx.fail(`Category "${d.category}" can't be selected. Choose one of: ${optionLabels('Category').join(', ')}`);
  }
  if (d.officialUrl) {
    const norm = (s: string) => String(s).replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    const ok = await selectOption('Official URL', (li) => norm(clean(li.innerText)) === norm(d.officialUrl!));
    if (ok) ctx.ok(`Official URL → ${clean(ok.innerText)}`);
    else ctx.fail(`Official URL "${d.officialUrl}" is not one of your verified sites`);
  }
  const fields = [['homepageUrl', /^Homepage URL/, 'Homepage URL'], ['supportUrl', /^Support URL/, 'Support URL'], ['promoVideo', /^Global promo video/, 'Global promo video']] as const;
  for (const [key, label, name] of fields) {
    ctx.check();
    if (d[key] !== undefined) await writeText(ctx, () => byLabel('input', label), String(d[key]), name);
  }
  if (d.matureContent !== undefined) {
    const sw = byLabel<HTMLElement>('[role="switch"]', /^Mature content/);
    if (!sw) ctx.fail('Mature content switch not found');
    else {
      if ((sw.getAttribute('aria-checked') === 'true') !== d.matureContent) sw.click();
      await sleep(100);
      if ((sw.getAttribute('aria-checked') === 'true') === d.matureContent) ctx.ok(`Mature content → ${d.matureContent ? 'on' : 'off'}`);
      else ctx.fail('Mature content switch did not change');
    }
  }
}

async function fillGlobalImages(ctx: RunContext, pkg: Package) {
  const { images, blobs } = pkg;
  for (const [type, title] of [['icon', 'Store icon'], ['smallTile', 'Small promo tile'], ['marquee', 'Marquee promo tile']] as const) {
    const path = images[type];
    if (!path) continue;
    ctx.check();
    const box = uploadBox(type);
    if (!box) { ctx.fail(`${title}: upload not found`); continue; }
    const blob = blobs[path];
    if (!blob) { ctx.fail(`${title}: ${path} missing from the package`); continue; }
    try { await uploadImage(ctx, box, blob, path.split('/').pop()!, type); ctx.ok(`${title} uploaded`); } catch (e) { ctx.fail(`${title}: ${(e as Error).message}`); }
  }
  if (images.screenshots.length) {
    ctx.check();
    const box = uploadBox('screenshot', true);
    if (!box) ctx.fail('Global screenshots: upload not found');
    else {
      try { await replaceScreenshots(ctx, box, images.screenshots, blobs, 'Global'); } catch (e) {
        if (e instanceof Stopped) throw e;
        ctx.fail(`Global screenshots: ${(e as Error).message}`);
      }
    }
  }
}

async function fillLanguage(ctx: RunContext, pkg: Package, code: string, data: Package['languages'][string]) {
  if (data.description !== undefined) {
    if (data.description.length > 16000) ctx.fail(`${code}: description is ${data.description.length} chars (max 16,000)`, data.description);
    else await writeText(ctx, () => byLabel('textarea', /^Description/), data.description, `${code}: description`);
  }
  if (data.promoVideo !== undefined) {
    await writeText(ctx, () => byLabel('input', /^Localized promo video/), data.promoVideo, `${code}: promo video`);
  }
  if (data.screenshots?.length) {
    ctx.check();
    const box = uploadBox('screenshot', false);
    if (!box) ctx.fail(`${code}: localized screenshots upload not found`);
    else {
      try { await replaceScreenshots(ctx, box, data.screenshots, pkg.blobs, code); } catch (e) {
        if (e instanceof Stopped) throw e;
        ctx.fail(`${code} screenshots: ${(e as Error).message}`);
      }
    }
  }
}

export async function fillListing(ctx: RunContext, pkg: Package, opts: ListingOptions) {
  const start = currentLanguage();
  try {
    if (opts.details) await fillDetails(ctx, pkg);
    if (opts.images) await fillGlobalImages(ctx, pkg);

    const codes = Object.keys(pkg.languages).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
    for (const code of codes) {
      const data = { ...pkg.languages[code] };
      if (!opts.descriptions) { delete data.description; delete data.promoVideo; }
      if (!opts.localizedImages) delete data.screenshots;
      if (data.description === undefined && data.promoVideo === undefined && !data.screenshots?.length) continue;

      ctx.check();
      const value = languageValue(code);
      if (!value) { ctx.skip(`${code}: not one of this item's languages`); continue; }
      ctx.info(`Language: ${code}`);
      if (!(await switchLanguage(value))) { ctx.fail(`${code}: could not switch language`, data.description); continue; }
      await fillLanguage(ctx, pkg, code, data);
    }
  } finally {
    if (start) await switchLanguage(start);
  }
}

// ---- Fill: Privacy -----------------------------------------------------------

export const certificationBoxes = () =>
  [...main().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((b) => /^I do not (sell|use)/.test(labelOf(b)));

export async function fillPrivacy(ctx: RunContext, pkg: Package) {
  const p = pkg.privacy;
  const text = (label: string | RegExp, value: string, name: string) =>
    writeText(ctx, () => byLabel<TextField>('textarea, input', label), value, name);

  if (p.singlePurpose) await text(/^Single purpose description/, p.singlePurpose, 'Single purpose');
  for (const [perm, why] of Object.entries(p.permissions ?? {})) {
    ctx.check();
    if (byLabel('textarea', `${perm} justification`)) await text(`${perm} justification`, why, `${perm} justification`);
    else ctx.skip(`${perm}: the uploaded package doesn't request it`);
  }
  if (p.hostPermission) {
    if (byLabel('textarea', /^Host permission justification/)) await text(/^Host permission justification/, p.hostPermission, 'Host permission justification');
    else ctx.skip('Host permission: the uploaded package requests none');
  }

  if (p.remoteCode !== undefined) {
    const radio = byLabel('input[type="radio"]', p.remoteCode ? /^Yes, I am using remote code/ : /^No, I am not using remote code/);
    if (!radio) ctx.fail('Remote code options not found');
    else {
      if (!radio.checked) radio.click();
      await sleep(200);
      if (radio.checked) ctx.ok(`Remote code → ${p.remoteCode ? 'yes' : 'no'}`); else ctx.fail('Remote code choice did not change');
    }
    if (p.remoteCode && p.remoteCodeJustification) await text(/^Justification$/, p.remoteCodeJustification, 'Remote code justification');
  }

  if (p.dataCollected) {
    const want = new Set<DataTypeKey>(p.dataCollected);
    let wrong = 0;
    for (const [key, label] of Object.entries(DATA_TYPES) as [DataTypeKey, string][]) {
      const box = byLabel('input[type="checkbox"]', label);
      if (!box) { wrong++; continue; }
      if (box.checked !== want.has(key)) box.click();
      if (box.checked !== want.has(key)) wrong++;
    }
    if (wrong) ctx.fail(`Data usage: ${wrong} checkbox(es) not set`);
    else ctx.ok(`Data collected → ${p.dataCollected.length ? p.dataCollected.map((k) => DATA_TYPES[k]).join(', ') : 'none'}`);
  }
  if (p.privacyPolicyUrl) await text(/^Privacy policy URL/, p.privacyPolicyUrl, 'Privacy policy URL');

  const certs = certificationBoxes();
  for (const b of certs) {
    const row = b.closest<HTMLElement>('label, li, div');
    if (row) Object.assign(row.style, { outline: '2px solid #f9ab00', outlineOffset: '4px', borderRadius: '6px' });
  }
  const unticked = certs.filter((b) => !b.checked);
  if (unticked[0]) {
    unticked[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    ctx.info(`Tick the ${unticked.length} highlighted certification(s) yourself.`);
  }
}

// ---- Fill: Test instructions ---------------------------------------------------

export async function fillTest(ctx: RunContext, pkg: Package) {
  const t = pkg.test ?? {};
  const fields = [['username', 'input', 'Username'], ['password', 'input', 'Password'], ['instructions', 'textarea', 'Additional instructions']] as const;
  for (const [key, sel, label] of fields) {
    const value = t[key];
    if (value === undefined) continue;
    ctx.check();
    await writeText(ctx, () => byLabel<TextField>(sel, label), String(value), label);
  }
}

// ---- Page buttons ---------------------------------------------------------------

export const pageButton = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => visible(b) && clean(b.innerText) === text) || null;
