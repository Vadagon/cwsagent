// Saves an item's listing from the console as a ZIP in the meta/ layout that
// Fill reads (see FORMAT.md), so a listing can round-trip.
//
// The console reloads the page between tabs, so a run is a small state machine
// kept in IndexedDB under "export": listing → privacy → test → installs →
// impressions → users → ratings → support → download.
// Reads only; switching the editing language or a chart's date range, and
// expanding a support issue, are view state, not edits.
import {
  allByLabel, boxImages, byLabel, currentLanguage, itemTitle, labelOf, languageOptions, main,
  pageKind, selectValue, sleep, switchLanguage, tabUrl, toLocalesCode, uploadBox, waitFor, type ReportKind, type TabKind,
} from './dashboard';
import { chooseRange, flatten, metricCsv, pageBlocks, RANGE_LABELS, ratingsHeadline, summarize, toCsv, type RangeChoice } from './analytics';
import { readSupport } from './support';
import { DATA_TYPES } from './reader';
import { store } from './store';
import type { DataTypeKey, RunContext, RunRecord } from './types';
import { zip } from './zip';

type Step = TabKind | ReportKind;
const STEPS: Step[] = ['listing', 'privacy', 'test', 'installs', 'impressions', 'users', 'ratings', 'support'];
const REPORT_TITLES: Record<ReportKind, string> = {
  installs: 'Installs & uninstalls', impressions: 'Impressions', users: 'Users', ratings: 'Ratings', support: 'User support',
};

/** What Extract saves. Listing text, images, privacy and test are on by default; reports are opt-in. */
export interface ExtractOptions {
  listing: boolean;
  images: boolean;
  privacy: boolean;
  test: boolean;
  installs: boolean;
  impressions: boolean;
  users: boolean;
  ratings: boolean;
  support: boolean;
  range: RangeChoice;
}

export const DEFAULT_EXTRACT: ExtractOptions = {
  listing: true, images: true, privacy: true, test: true,
  installs: false, impressions: false, users: false, ratings: false, support: false,
  range: '90',
};

/** The tabs a run visits, in order, for these options. */
export function stepsFor(o: ExtractOptions): Step[] {
  return STEPS.filter((s) => (s === 'listing' ? o.listing || o.images : o[s]));
}

export interface ExportState {
  itemId: string;
  step: Step;
  options: ExtractOptions;
  /** Per-report summary, written to analytics/summary.json. */
  analytics?: Record<string, unknown>;
  startedAt: number;
  listing: Record<string, any>;
  files: Record<string, Blob>;
  log?: RunRecord[];
}

export const exportState = () => store.get<ExportState>('export');
export const cancelExport = () => store.delete('export');
export async function startExport(itemId: string, options: ExtractOptions) {
  const steps = stepsFor(options);
  if (!steps[0]) throw new Error('Nothing selected to extract');
  await store.set('export', { itemId, step: steps[0], options, startedAt: Date.now(), listing: {}, files: {} } satisfies ExportState);
}

/** Full-size original of a console image (thumbnails are resized WebP). */
export function originalUrl(src: string): string {
  try {
    const u = new URL(src, location.href);
    if (/googleusercontent\.com$/.test(u.hostname)) return src.replace(/=[^/]*$/, '') + '=s0';
  } catch { /* not a URL: use as is */ }
  return src;
}

async function fetchImage(src: string) {
  const res = await fetch(originalUrl(src), { credentials: 'omit' });
  if (!res.ok) throw new Error(`image request failed (${res.status})`);
  let blob = await res.blob();
  if (!/image\/(png|jpeg)/.test(blob.type)) {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    blob = await canvas.convertToBlob({ type: 'image/png' });
  }
  return { blob, ext: blob.type === 'image/jpeg' ? 'jpg' : 'png' };
}

async function grabImages(ctx: RunContext, srcs: string[], name: (i: number, ext: string) => string, files: Record<string, Blob>, label: string) {
  const paths: string[] = [];
  for (let i = 0; i < srcs.length; i++) {
    ctx.check();
    try {
      const { blob, ext } = await fetchImage(srcs[i]!);
      const path = name(i, ext);
      files[path] = blob;
      paths.push(path);
    } catch (e) {
      ctx.fail(`${label}${srcs.length > 1 ? ` ${i + 1}` : ''}: ${(e as Error).message}`);
    }
  }
  return paths;
}

// ---- Store listing -----------------------------------------------------------

async function extractListing(ctx: RunContext, state: ExportState) {
  const L = state.listing;
  const files = state.files;
  const { listing: text, images } = state.options;
  L.itemName = itemTitle();

  if (text) {
    const category = selectValue('Category');
    if (category && !/^select/i.test(category)) L.category = category;
    const official = selectValue('Official URL');
    if (official && !/^none$/i.test(official)) L.officialUrl = official;
    for (const [key, label] of [['homepageUrl', /^Homepage URL/], ['supportUrl', /^Support URL/], ['promoVideo', /^Global promo video/]] as const) {
      const v = byLabel('input', label)?.value;
      if (v) L[key] = v;
    }
    const mature = byLabel<HTMLElement>('[role="switch"]', /^Mature content/);
    if (mature) L.matureContent = mature.getAttribute('aria-checked') === 'true';
    ctx.ok('Details');
  }

  if (images) for (const [type, base, title] of [['icon', 'icon/store-128', 'Store icon'], ['smallTile', 'promo/small-440x280', 'Small promo tile'], ['marquee', 'promo/marquee-1400x560', 'Marquee']] as const) {
    const src = uploadBox(type)?.querySelector('img')?.src;
    if (src && (await grabImages(ctx, [src], (_, ext) => `${base}.${ext}`, files, title)).length) ctx.ok(title);
  }
  const globalShots = images ? boxImages(uploadBox('screenshot', true)).map((i) => i.src) : [];
  if (globalShots.length) {
    const got = await grabImages(ctx, globalShots, (i, ext) => `screenshots/${i + 1}.${ext}`, files, 'Screenshot');
    ctx.ok(`${got.length} global screenshots`);
  }

  const start = currentLanguage();
  const values = languageOptions();
  const languages: Record<string, { promoVideo?: string }> = {};
  let described = 0;
  try {
    for (const [n, value] of values.entries()) {
      ctx.check();
      ctx.progress(`Reading languages ${n + 1}/${values.length}`);
      if (!(await switchLanguage(value))) { ctx.fail(`${value}: could not switch language`); continue; }
      const code = toLocalesCode(value);
      if (text) {
        const desc = byLabel<HTMLTextAreaElement>('textarea', /^Description/)?.value?.trim();
        if (desc) { files[`descriptions/${code}.txt`] = new Blob([desc + '\n'], { type: 'text/plain' }); described++; }
        const video = byLabel('input', /^Localized promo video/)?.value;
        if (video) (languages[code] ??= {}).promoVideo = video;
      }
      const shots = images ? boxImages(uploadBox('screenshot', false)).map((i) => i.src) : [];
      if (shots.length) {
        const got = await grabImages(ctx, shots, (i, ext) => `screenshots/${code}/${i + 1}.${ext}`, files, `${code} screenshot`);
        if (got.length) ctx.ok(`${code}: ${got.length} localized screenshots`);
      }
    }
  } finally {
    if (start) await switchLanguage(start);
  }
  if (Object.keys(languages).length) L.languages = languages;
  if (text) ctx.ok(`Descriptions: ${described} of ${values.length} languages`);
}

// ---- Privacy -------------------------------------------------------------------

async function extractPrivacy(ctx: RunContext, state: ExportState) {
  const v = (label: RegExp) => byLabel<HTMLTextAreaElement>('textarea, input', label)?.value?.trim() || undefined;
  const P: Record<string, any> = {};
  P.singlePurpose = v(/^Single purpose description/);
  const permissions: Record<string, string> = {};
  for (const ta of allByLabel('textarea', / justification$/i)) {
    const label = labelOf(ta);
    if (/^Host permission/i.test(label)) continue;
    if (ta.value.trim()) permissions[label.replace(/ justification$/i, '')] = ta.value.trim();
  }
  if (Object.keys(permissions).length) P.permissions = permissions;
  P.hostPermission = v(/^Host permission justification/);
  const yes = byLabel('input[type="radio"]', /^Yes, I am using remote code/);
  const no = byLabel('input[type="radio"]', /^No, I am not using remote code/);
  if (yes?.checked) { P.remoteCode = true; P.remoteCodeJustification = v(/^Justification$/); } else if (no?.checked) P.remoteCode = false;
  P.dataCollected = (Object.entries(DATA_TYPES) as [DataTypeKey, string][])
    .filter(([, label]) => byLabel('input[type="checkbox"]', label)?.checked).map(([k]) => k);
  P.privacyPolicyUrl = v(/^Privacy policy URL/);
  for (const k of Object.keys(P)) if (P[k] === undefined) delete P[k];
  state.listing.privacy = P;
  ctx.ok(`Privacy: ${Object.keys(permissions).length} justifications, ${P.dataCollected.length} data types`);
}

// ---- Test instructions ---------------------------------------------------------------

async function extractTest(ctx: RunContext, state: ExportState) {
  const T: Record<string, string> = {};
  const user = byLabel('input', 'Username')?.value;
  const notes = byLabel<HTMLTextAreaElement>('textarea', 'Additional instructions')?.value;
  if (user) T.username = user;
  if (notes) T.instructions = notes;
  if (byLabel('input', 'Password')?.value) ctx.info('Test password left out of the ZIP on purpose.');
  if (Object.keys(T).length) state.listing.testInstructions = T;
  ctx.ok('Test instructions');
}

// ---- Analytics, ratings, user support ---------------------------------------------------

async function extractChart(ctx: RunContext, state: ExportState, kind: Exclude<ReportKind, 'support'>) {
  const title = REPORT_TITLES[kind];
  const want = state.options.range;
  ctx.progress(`${title}: ${RANGE_LABELS[want]}`);
  const ranged = await chooseRange(want);
  let rows = ranged?.blocks ? flatten(ranged.blocks, state.itemId) : [];
  let range = ranged?.label ?? '';
  if (!rows.length) {
    rows = flatten(pageBlocks(), state.itemId);
    if (!ranged || ranged.blocks) {
      range = 'Last 30 days (page default)';
      if (want !== '30') ctx.info(`${title}: ${RANGE_LABELS[want]} returned no data; saved the default 30 days`);
    }
  }
  if (!rows.length) { ctx.skip(`${title}: no data`); return; }
  state.files[`analytics/${kind}.csv`] = new Blob([metricCsv(rows)], { type: 'text/csv' });
  (state.analytics ??= {})[kind] = { range, ...summarize(rows), ...(kind === 'ratings' ? { page: ratingsHeadline() } : {}) };
  ctx.ok(`${title}: ${rows.length} data points (${range})`);
}

async function extractSupport(ctx: RunContext, state: ExportState) {
  const issues = await readSupport(ctx);
  if (!issues.length) { ctx.skip('User support: no issues'); return; }
  state.files['support/issues.json'] = new Blob([JSON.stringify(issues, null, 2) + '\n'], { type: 'application/json' });
  state.files['support/issues.csv'] = new Blob([toCsv(
    ['date', 'type', 'subject', 'from', 'status', 'itemVersion', 'clientVersion', 'message', 'replies'],
    issues.map((i) => [i.date, i.type, i.subject, i.from, i.status, i.itemVersion ?? '', i.clientVersion ?? '', i.message,
      i.replies.map((r) => `${r.date} ${r.author}: ${r.text}`).join('\n')]),
  )], { type: 'text/csv' });
  (state.analytics ??= {}).support = { issues: issues.length, open: issues.filter((i) => /open/i.test(i.status)).length };
  ctx.ok(`User support: ${issues.length} issue${issues.length > 1 ? 's' : ''}`);
}

// ---- ZIP ---------------------------------------------------------------------------

const slug = (s: unknown) => String(s || 'listing').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'listing';

export async function buildExportZip(state: ExportState) {
  const listing: Record<string, unknown> = { format: 'cwsagent', version: 1, itemId: state.itemId, ...state.listing, extractedAt: new Date().toISOString() };
  const entries: { path: string; data: Blob | string }[] = [{ path: 'listing.json', data: JSON.stringify(listing, null, 2) + '\n' }];
  if (state.analytics && Object.keys(state.analytics).length) {
    entries.push({ path: 'analytics/summary.json', data: JSON.stringify(state.analytics, null, 2) + '\n' });
  }
  for (const [path, data] of Object.entries(state.files).sort(([a], [b]) => a.localeCompare(b))) entries.push({ path, data });
  return { blob: await zip(entries), name: `${slug(listing.itemName)}-listing-${new Date().toISOString().slice(0, 10)}.zip`, count: entries.length };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Runs the current step if this page is it. Returns 'navigated' when it moved
 * on to the next tab, 'done' after the download, 'elsewhere' when this page
 * belongs to another item, or 'none' with no save in progress.
 */
export async function continueExport(ctx: RunContext): Promise<'none' | 'elsewhere' | 'navigated' | 'done'> {
  const state = await exportState();
  if (!state) return 'none';
  const page = pageKind();
  if (page.itemId !== state.itemId) return 'elsewhere';
  if (page.kind !== state.step) {
    location.assign(tabUrl(state.step)!);
    return 'navigated';
  }

  await waitFor(() => main().querySelector('textarea, input, [role="combobox"], table') || /No issues found/i.test(main().innerText), { timeout: 15000 });
  await sleep(800);
  const step = state.step;
  if (step === 'listing') await extractListing(ctx, state);
  else if (step === 'privacy') await extractPrivacy(ctx, state);
  else if (step === 'test') await extractTest(ctx, state);
  else if (step === 'support') await extractSupport(ctx, state);
  else await extractChart(ctx, state, step);

  // Results survive the page load so the final report covers every tab.
  const prior = state.log ?? [];
  state.log = [...prior, ...ctx.records];
  const steps = stepsFor(state.options);
  const next = steps[steps.indexOf(state.step) + 1];
  if (next) {
    state.step = next;
    await store.set('export', state);
    location.assign(tabUrl(next)!);
    return 'navigated';
  }
  const result = await buildExportZip(state);
  download(result.blob, result.name);
  await cancelExport();
  ctx.records.unshift(...prior);
  ctx.ok(`Saved ${result.name} (${result.count} files, ${(result.blob.size / 1048576).toFixed(1)} MB) to Downloads`);
  return 'done';
}
