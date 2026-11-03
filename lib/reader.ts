// Turns a dropped listing package (folder or ZIP, layout in FORMAT.md) into one Package.
import { store } from './store';
import type { DataTypeKey, FileEntry, Package, Privacy, Publish } from './types';
import { unzip } from './zip';

const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|node_modules)(\/|$)/;
const MARKERS = ['listing.json', 'languages/', 'images/'];
const MANIFEST = /(^|\/)store\/publish\.json$/;

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
  // A meta/ folder with a publish manifest carries the release ZIP as a file.
  const keepZips = files.some((f) => MANIFEST.test(f.path));
  const out: FileEntry[] = [];
  for (const f of files) {
    if (!keepZips && /\.zip$/i.test(f.path)) out.push(...(await unzip(f.blob)));
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

// ---- Normalization ---------------------------------------------------------

type Json = Record<string, any>;

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

const DETAIL_KEYS = ['category', 'officialUrl', 'homepageUrl', 'supportUrl', 'matureContent', 'promoVideo'] as const;
const IMAGE = '(png|jpe?g)';
const SINGLE = { icon: 'icon', smallTile: 'small-tile', marquee: 'marquee' } as const;

// ---- Package layout ----------------------------------------------------------

type Parts = Pick<Package, 'details' | 'languages' | 'images' | 'privacy' | 'test' | 'blobs'>;

async function readLayout(rel: Map<string, Blob>, listing: Json, notes: string[]): Promise<Parts> {
  const parts: Parts = { details: {}, languages: {}, images: { screenshots: [] }, privacy: {}, test: null, blobs: {} };
  const keep = (path: string) => { parts.blobs[path] = rel.get(path)!; return path; };
  const lang = (code: string) => (parts.languages[code] ??= {});
  const shots: Record<string, { n: number; path: string }[]> = {};
  const unknown: string[] = [];

  for (const [path, blob] of rel) {
    let m: RegExpMatchArray | null;
    if (path === 'listing.json' || /^(analytics|support)\//.test(path)) continue; // Extract's reports
    if ((m = path.match(/^languages\/([A-Za-z_-]+)\/description\.txt$/))) {
      const text = (await blob.text()).replace(/\r\n/g, '\n').trim();
      if (text) lang(m[1]!).description = text; else notes.push(`${path} is empty, skipped.`);
    }
    else if ((m = path.match(new RegExp(`^languages/([A-Za-z_-]+)/screenshots/(\\d+)\\.${IMAGE}$`, 'i')))) (shots[m[1]!] ??= []).push({ n: +m[2]!, path });
    else if ((m = path.match(new RegExp(`^images/screenshots/(\\d+)\\.${IMAGE}$`, 'i')))) (shots[''] ??= []).push({ n: +m[1]!, path });
    else if ((m = path.match(new RegExp(`^images/(icon|small-tile|marquee)\\.${IMAGE}$`, 'i')))) {
      const slot = (Object.keys(SINGLE) as (keyof typeof SINGLE)[]).find((k) => SINGLE[k] === m![1]!.toLowerCase())!;
      parts.images[slot] = keep(path);
    } else unknown.push(path);
  }
  for (const [code, list] of Object.entries(shots)) {
    const sorted = list.sort((a, b) => a.n - b.n);
    if (sorted.length > 5) notes.push(`${code || 'Global'} screenshots: only the first 5 are used.`);
    const paths = sorted.slice(0, 5).map((s) => keep(s.path));
    if (code) lang(code).screenshots = paths; else parts.images.screenshots = paths;
  }
  if (unknown.length) notes.push(`Not part of the format, ignored: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''}.`);

  for (const [code, v] of Object.entries((listing.languages ?? {}) as Record<string, Json>)) {
    if (v?.promoVideo) lang(code).promoVideo = String(v.promoVideo);
  }
  for (const k of DETAIL_KEYS) {
    if (listing[k] !== undefined && listing[k] !== null && listing[k] !== '') (parts.details as Json)[k] = listing[k];
  }
  parts.privacy = normalizePrivacy(listing.privacy ?? {}, notes);
  if (listing.testInstructions) parts.test = listing.testInstructions;
  if (listing.distribution) notes.push('distribution in listing.json is ignored: visibility and pricing are never changed.');
  return parts;
}

// ---- meta/store/publish.json (META.md layout) -----------------------------------

/** Reads a publish manifest; its paths are relative to the meta/ folder that holds store/. */
async function readManifest(rel: Map<string, Blob>, m: Json, notes: string[]): Promise<Parts & { publish: Publish }> {
  const parts: Parts = { details: {}, languages: {}, images: { screenshots: [] }, privacy: {}, test: null, blobs: {} };
  const missing: string[] = [];
  const keep = (path: unknown) => {
    if (typeof path !== 'string' || !path) return undefined;
    const blob = rel.get(path);
    if (!blob) { missing.push(path); return undefined; }
    parts.blobs[path] = blob;
    return path;
  };
  const list = (paths: unknown, max: number, label: string) => {
    const all = (Array.isArray(paths) ? paths : []).map(keep).filter((p): p is string => !!p);
    if (all.length > max) notes.push(`${label}: only the first ${max} screenshots are used.`);
    return all;
  };

  const d = m.details ?? {};
  for (const k of [...DETAIL_KEYS, 'edgeCategory'] as const) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') (parts.details as Json)[k] = d[k];
  }
  const img = m.images ?? {};
  for (const slot of ['icon', 'smallTile', 'marquee', 'edgeLogo'] as const) {
    const path = keep(img[slot]);
    if (path) parts.images[slot] = path;
  }
  parts.images.screenshots = list(img.screenshots, 5, 'Global');

  for (const [code, l] of Object.entries((m.languages ?? {}) as Record<string, Json>)) {
    if (l.inPackage === false) continue;
    const lang: Package['languages'][string] = {};
    const descPath = keep(l.description);
    if (descPath) {
      const text = (await rel.get(descPath)!.text()).replace(/\r\n/g, '\n').trim();
      if (text) lang.description = text; else notes.push(`${descPath} is empty, skipped.`);
      delete parts.blobs[descPath];
    }
    const shots = list(l.screenshots, 5, code);
    if (shots.length) lang.screenshots = shots;
    if (l.promoVideo) lang.promoVideo = String(l.promoVideo);
    if (l.edge) lang.edgeName = String(l.edge);
    if (Array.isArray(l.searchTerms) && l.searchTerms.length) lang.searchTerms = l.searchTerms.map(String);
    parts.languages[code] = lang;
  }
  const skipped = Object.entries((m.languages ?? {}) as Record<string, Json>).filter(([, l]) => l.inPackage === false).map(([c]) => c);
  if (skipped.length) notes.push(`Not in the extension package, skipped: ${skipped.join(', ')}.`);

  parts.privacy = normalizePrivacy(m.privacy ?? {}, notes);
  if (m.testInstructions) parts.test = m.testInstructions;
  if (missing.length) notes.push(`Named in publish.json but not in the drop: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`);

  const packageZip = keep(m.package?.zip);
  const publish: Publish = {
    chromeItemId: m.stores?.chrome?.itemId,
    edgeProductId: m.stores?.edge?.productId,
    packageZip,
    version: m.package?.version,
    manual: Array.isArray(m.manual) ? m.manual : [],
  };
  for (const r of Array.isArray(m.review) ? m.review : []) notes.push(`Review: ${r}`);
  return { ...parts, publish };
}

// ---- Entry point -----------------------------------------------------------

export async function buildPackage(files: FileEntry[], sourceName?: string): Promise<Package> {
  const manifestFile = files.find((f) => MANIFEST.test(f.path));
  if (manifestFile) {
    const root = manifestFile.path.replace(/store\/publish\.json$/, '');
    const rel = new Map<string, Blob>();
    for (const f of files) if (f.path.startsWith(root)) rel.set(f.path.slice(root.length), f.blob);
    const notes: string[] = [];
    const m = await readJson(manifestFile.blob, notes);
    if (m.format !== 1) notes.push(`publish.json format ${m.format ?? 'missing'}; this CWSAgent reads format 1.`);
    const parts = await readManifest(rel, m, notes);
    return {
      ...parts,
      name: sourceName || m.extension || root.replace(/\/$/, '').split('/').pop() || 'meta',
      itemId: parts.publish.chromeItemId ?? null,
      loadedAt: Date.now(),
      notes,
    };
  }

  const root = findRoot(files.map((f) => f.path));
  if (root === null) throw new Error('No listing found: expected listing.json, languages/ or images/.');

  const rel = new Map<string, Blob>();
  for (const f of files) if (f.path.startsWith(root)) rel.set(f.path.slice(root.length), f.blob);

  const notes: string[] = [];
  const listing = await readJson(rel.get('listing.json'), notes);
  const parts = await readLayout(rel, listing, notes);

  return {
    ...parts,
    name: sourceName || listing.itemName || root.replace(/\/$/, '').split('/').pop() || 'listing',
    itemId: typeof listing.itemId === 'string' ? listing.itemId : null,
    loadedAt: Date.now(),
    notes,
  };
}

export const savePackage = (pkg: Package) => store.set('package', pkg);
export const loadPackage = () => store.get<Package>('package');
export const clearPackage = () => store.delete('package');
