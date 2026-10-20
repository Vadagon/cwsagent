// Turns a dropped meta folder, its ZIP, or a cws-listing ZIP into one Package.
import { store } from './store';
import type { DataTypeKey, FileEntry, Package, Privacy } from './types';
import { unzip } from './zip';

const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|raw|prompts|competitors|live|node_modules)(\/|$)/;
const MARKERS = ['listing.json', 'descriptions/', 'data/dashboard.json', 'screenshots/', 'promo/', 'images/'];

export const DATA_TYPES: Record<DataTypeKey, string> = {
  pii: 'Personally identifiable information',
  health: 'Health information',
  financial: 'Financial and payment information',
  authentication: 'Authentication information',
  communications: 'Personal communications',
  location: 'Location',
  webHistory: 'Web history',
  userActivity: 'User activity',
  websiteContent: 'Website content',
};

// ---- Collecting files ----------------------------------------------------

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      next();
    }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: FileEntry[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ path: prefix + entry.name, blob: file });
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Files from a drop: folders, a ZIP, or loose files. */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<FileEntry[]> {
  const entries = [...dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const out: FileEntry[] = [];
  for (const entry of entries) await walkEntry(entry, '', out);
  return expandZips(out);
}

/** Files from <input webkitdirectory> or a plain file input. */
export async function filesFromInput(fileList: FileList | File[]): Promise<FileEntry[]> {
  const out = [...fileList].map((f) => ({ path: f.webkitRelativePath || f.name, blob: f as Blob }));
  return expandZips(out);
}

async function expandZips(files: FileEntry[]): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.path)) out.push(...(await unzip(f.blob)));
    else out.push(f);
  }
  return out.filter((f) => !IGNORED.test(f.path));
}

/** The folder inside the drop that actually is the listing. */
function findRoot(paths: string[]): string | null {
  const candidates = new Set(['']);
  for (const p of paths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) candidates.add(parts.slice(0, i).join('/') + '/');
  }
  const scored = [...candidates]
    .map((root) => ({ root, hits: MARKERS.filter((m) => paths.some((p) => p.startsWith(root + m))).length }))
    .filter((c) => c.hits)
    .sort((a, b) => b.hits - a.hits || a.root.length - b.root.length);
  return scored[0]?.root ?? null;
}

// ---- Shared normalization -------------------------------------------------

type Json = Record<string, any>;
const byNumber = (a: { name: string }, b: { name: string }) => parseInt(a.name, 10) - parseInt(b.name, 10);

async function readJson(file: Blob | undefined, notes: string[]): Promise<Json> {
  if (!file) return {};
  try { return JSON.parse(await file.text()); } catch (e) {
    notes.push(`Ignored invalid JSON: ${(e as Error).message}`);
    return {};
  }
}

/** Accepts keys (`webHistory`) or labels in any case (`web history`). */
export function dataTypeKey(value: unknown): DataTypeKey | null {
  const v = String(value).toLowerCase().replace(/[^a-z]/g, '');
  const hit = (Object.entries(DATA_TYPES) as [DataTypeKey, string][]).find(([k, label]) =>
    k.toLowerCase() === v || label.toLowerCase().replace(/[^a-z]/g, '') === v);
  return hit?.[0] ?? null;
}

function normalizePrivacy(p: Json, notes: string[]): Privacy {
  const out: Privacy = {};
  if (p.singlePurpose) out.singlePurpose = String(p.singlePurpose);
  if (p.permissions && Object.keys(p.permissions).length) out.permissions = p.permissions;
  if (p.hostPermission) out.hostPermission = String(p.hostPermission);
  if (p.remoteCode !== undefined && p.remoteCode !== null) out.remoteCode = !!p.remoteCode;
  if (p.remoteCodeJustification) out.remoteCodeJustification = String(p.remoteCodeJustification);
  if (Array.isArray(p.dataCollected)) {
    out.dataCollected = [];
    for (const d of p.dataCollected) {
      const key = dataTypeKey(d);
      if (key) out.dataCollected.push(key); else notes.push(`Unknown data type "${d}" ignored.`);
    }
  }
  if (p.privacyPolicyUrl) out.privacyPolicyUrl = String(p.privacyPolicyUrl);
  if (p.certify !== undefined) notes.push('The data-use certifications are never ticked for you; tick them yourself on Privacy.');
  return out;
}

type Parts = Pick<Package, 'details' | 'languages' | 'images' | 'privacy' | 'test'> & { blobs: Record<string, Blob> };
const empty = (): Parts => ({ details: {}, languages: {}, images: { screenshots: [] }, privacy: {}, test: null, blobs: {} });

const DETAIL_KEYS = ['category', 'officialUrl', 'homepageUrl', 'supportUrl', 'matureContent', 'promoVideo'] as const;

/** Host patterns go to the single host field; named permissions keep their own. */
function splitPermissions(entries: unknown, skipUnused: boolean) {
  const permissions: Record<string, string> = {};
  const hostParts: string[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.permission || !entry.justification || (skipUnused && entry.unused)) continue;
    if (/[:*<]/.test(entry.permission)) hostParts.push(entry.justification);
    else permissions[entry.permission] = entry.justification;
  }
  return { permissions, host: hostParts.length ? [...new Set(hostParts)].join('\n') : undefined };
}

// ---- meta/ folder (Extension Marketing skill layout + listing.json) -------

async function fromMetaFolder(rel: Map<string, Blob>, listing: Json, notes: string[]): Promise<Parts> {
  const pkg = empty();
  const keep = (path: string) => { pkg.blobs[path] = rel.get(path)!; return path; };
  const lang = (code: string) => (pkg.languages[code] ??= {});
  const dashboard = await readJson(rel.get('data/dashboard.json'), notes);
  const localized: Record<string, { name: string; path: string }[]> = {};

  for (const [path, blob] of rel) {
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^descriptions\/([A-Za-z_-]+)\.txt$/))) {
      lang(m[1]!).description = (await blob.text()).replace(/\r\n/g, '\n').trim();
    } else if ((m = path.match(/^screenshots\/([A-Za-z_-]+)\/(\d+)\.(png|jpe?g)$/i))) {
      (localized[m[1]!] ??= []).push({ name: m[2]!, path: keep(path) });
    }
  }
  for (const [code, shots] of Object.entries(localized)) {
    lang(code).screenshots = shots.sort(byNumber).slice(0, 5).map((s) => s.path);
  }
  for (const [code, v] of Object.entries((listing.languages ?? {}) as Record<string, Json>)) {
    if (v.description) lang(code).description = String(v.description).trim();
    if (v.promoVideo) lang(code).promoVideo = String(v.promoVideo);
  }

  const pick = (...names: string[]) => names.find((n) => rel.has(n));
  pkg.images.screenshots = [...rel.keys()]
    .map((p) => p.match(/^screenshots\/(\d+)\.(png|jpe?g)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1]!, path: m[0] }))
    .sort(byNumber)
    .slice(0, 5)
    .map((s) => keep(s.path));
  const icon = pick('icon/store-128.png', 'icon/128.png', 'icon/icon-128.png', 'store-icon.png', 'icon/store-128.jpg');
  const small = pick('promo/small-440x280.png', 'promo/small-440x280.jpg', 'promo/small-440x280.jpeg');
  const marquee = pick('promo/marquee-1400x560.png', 'promo/marquee-1400x560.jpg', 'promo/marquee-1400x560.jpeg');
  if (icon) pkg.images.icon = keep(icon);
  if (small) pkg.images.smallTile = keep(small);
  if (marquee) pkg.images.marquee = keep(marquee);

  for (const k of DETAIL_KEYS) {
    if (listing[k] !== undefined && listing[k] !== null && listing[k] !== '') (pkg.details as Json)[k] = listing[k];
  }
  if (pkg.details.category === undefined && dashboard.category) pkg.details.category = dashboard.category;

  // Privacy: dashboard.json first, listing.json wins
  const p: Json = listing.privacy ?? {};
  const { permissions, host } = splitPermissions(dashboard.permissions, true);
  Object.assign(permissions, p.permissions ?? {});
  pkg.privacy = normalizePrivacy({
    ...p,
    permissions,
    hostPermission: p.hostPermission ?? host,
    singlePurpose: p.singlePurpose ?? dashboard.singlePurpose,
  }, notes);

  if (listing.testInstructions) pkg.test = listing.testInstructions;
  if (listing.distribution) notes.push('distribution in listing.json is ignored: visibility and pricing are never changed.');
  if ([...rel.keys()].some((k) => k.startsWith('locales/'))) {
    notes.push('locales/ is not applied: the title and summary come from the uploaded package.');
  }
  return pkg;
}

// ---- cws-listing ZIP (CWS Listing Filler / Extension Marketing export) ----

async function fromCwsListing(rel: Map<string, Blob>, listing: Json, notes: string[]): Promise<Parts> {
  const pkg = empty();
  const s: Json = listing.storeListing ?? {};
  const file = (path: string | null | undefined, what: string) => {
    if (!path) return null;
    if (!rel.has(path)) { notes.push(`${what}: ${path} is missing from the ZIP.`); return null; }
    pkg.blobs[path] = rel.get(path)!;
    return path;
  };

  for (const [code, path] of Object.entries((s.descriptions ?? {}) as Record<string, string>)) {
    const blob = rel.get(path);
    if (blob) (pkg.languages[code] ??= {}).description = (await blob.text()).replace(/\r\n/g, '\n').trim();
    else notes.push(`Description ${code}: ${path} is missing from the ZIP.`);
  }
  for (const [code, paths] of Object.entries((s.localizedScreenshots ?? {}) as Record<string, string[]>)) {
    const kept = (paths ?? []).map((p) => file(p, `Screenshot ${code}`)).filter((p): p is string => !!p);
    if (kept.length) (pkg.languages[code] ??= {}).screenshots = kept.slice(0, 5);
  }
  pkg.images.screenshots = ((s.screenshots ?? []) as string[]).map((p) => file(p, 'Screenshot')).filter((p): p is string => !!p).slice(0, 5);
  const icon = file(s.icon, 'Icon');
  const small = file(s.promoSmall, 'Small promo tile');
  const marquee = file(s.promoMarquee, 'Marquee');
  if (icon) pkg.images.icon = icon;
  if (small) pkg.images.smallTile = small;
  if (marquee) pkg.images.marquee = marquee;

  for (const k of DETAIL_KEYS) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '') (pkg.details as Json)[k] = s[k];
  }

  const p: Json = listing.privacy ?? {};
  const { permissions, host } = splitPermissions(p.permissions, false);
  pkg.privacy = normalizePrivacy({
    singlePurpose: p.singlePurpose,
    permissions,
    hostPermission: host,
    remoteCode: p.remoteCode?.uses,
    remoteCodeJustification: p.remoteCode?.justification,
    dataCollected: p.dataCollected,
    privacyPolicyUrl: p.privacyPolicyUrl,
  }, notes);
  if (listing.package) notes.push('package name and summary are not applied: they come from the uploaded package.');
  return pkg;
}

// ---- Entry point -----------------------------------------------------------

export async function buildPackage(files: FileEntry[], sourceName?: string): Promise<Package> {
  const root = findRoot(files.map((f) => f.path));
  if (root === null) throw new Error('No listing found: expected listing.json, descriptions/, screenshots/ or promo/.');

  const rel = new Map<string, Blob>();
  for (const f of files) if (f.path.startsWith(root)) rel.set(f.path.slice(root.length), f.blob);

  const notes: string[] = [];
  const listing = await readJson(rel.get('listing.json'), notes);
  const isCws = listing.format === 'cws-listing';
  const pkg = isCws ? await fromCwsListing(rel, listing, notes) : await fromMetaFolder(rel, listing, notes);

  return {
    ...pkg,
    format: isCws ? 'cws-listing' : 'meta',
    name: sourceName || listing.itemName || root.replace(/\/$/, '') || 'listing',
    itemId: typeof listing.itemId === 'string' ? listing.itemId : null,
    loadedAt: Date.now(),
    notes,
  };
}

export const savePackage = (pkg: Package) => store.set('package', pkg);
export const loadPackage = () => store.get<Package>('package');
export const clearPackage = () => store.delete('package');
