// Extension Tower connection. The API key lives here, in the extension's own
// IndexedDB, and every request goes from this worker: the key never reaches a
// store page. Extension Tower allows chrome-extension:// origins, so no host
// permission is needed. Without a key, nothing is ever sent.
//
// It also remembers what the store pages report: that the Chrome console ran
// CWSAgent at all (Chrome blocks it unless the publishing window allows it),
// the console's publisher ID per item, and which store item each extension
// is linked to. The popup's store buttons open a page and leave a pending
// update here; that page finds the item (or offers to create one), links it,
// syncs and autofills.
import { matchName } from '../lib/match';
import { store } from '../lib/store';
import type { Hello, Pending, Store, TowerExtension, TowerFile, TowerDetails, TowerMatch, TowerMessage, TowerState, TowerStatus } from '../lib/tower';

const API = (import.meta.env.WXT_EXTENSIONTOWER_URL as string | undefined) || 'https://extensiontower.com';
const KEY = 'towerKey';
const KEY_PATTERN = /^et_api_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;
const CONSOLE = 'https://chrome.google.com/webstore/devconsole';
const EDGE = 'https://partner.microsoft.com/en-us/dashboard/microsoftedge';

class TowerError extends Error {}
class TowerRejected extends TowerError {}

async function request(path: string): Promise<Response> {
  const key = await store.get<string>(KEY);
  if (!key) throw new TowerError('Connect Extension Tower first.');
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` }, credentials: 'omit' });
  if (res.status === 401) throw new TowerRejected('Extension Tower rejected the API token. Connect again.');
  return res;
}

async function failure(res: Response): Promise<never> {
  const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new TowerError(body?.error?.message || `Extension Tower answered ${res.status}.`);
}

function base64(bytes: ArrayBuffer): string {
  let text = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(text);
}

// ---- Extension Tower ---------------------------------------------------------

async function status(itemId: string): Promise<TowerStatus> {
  if (!(await store.get<string>(KEY))) return { connected: false };
  if (!itemId) return { connected: true };
  const res = await request(`/api/v1/extensions/${itemId}/publishing-access`);
  if (res.status === 404) return { connected: true, available: false };
  if (!res.ok) await failure(res);
  return { connected: true, available: true };
}

async function list(): Promise<TowerExtension[]> {
  const res = await request('/api/v1/extensions');
  if (!res.ok) await failure(res);
  const { extensions } = await res.json() as { extensions: TowerExtension[] };
  const slim = extensions.map(({ id, name, icon, storeUrl }) => ({ id, name, icon, storeUrl }));
  await store.set('towerExtensions', slim);
  return slim;
}

/** What a listing's package holds. Only for the card: unknown when it can't be read. */
async function packageDetails(id: string): Promise<TowerDetails | 'locked' | undefined> {
  try {
    const res = await request(`/api/v1/extensions/${id}/package`);
    if (res.status === 403) return 'locked'; // one-click Sync is paid; a dropped ZIP or folder stays free
    if (!res.ok) return undefined;
    const { files } = await res.json() as { files: { path: string; text?: string }[] };
    const paths = files.map((f) => f.path);
    const listing = JSON.parse(files.find((f) => f.path === 'listing.json')?.text ?? '{}') as { category?: string; privacy?: object };
    return {
      languages: new Set(paths.flatMap((p) => p.match(/^languages\/([^/]+)\//)?.[1] ?? [])).size,
      screenshots: paths.filter((p) => p.includes('screenshots/')).length,
      icon: paths.includes('images/icon'),
      smallTile: paths.includes('images/small-tile'),
      marquee: paths.includes('images/marquee'),
      category: listing.category,
      privacy: !!listing.privacy,
    };
  } catch (e) {
    if (e instanceof TowerRejected) throw e;
    return undefined;
  }
}

/** Finds the console item's listing: its link, its ID, its store URL, then a unique name among listings not tied to another item. */
async function match(itemId: string, title?: string | null): Promise<TowerMatch> {
  if (!(await store.get<string>(KEY))) return { connected: false };
  try {
    const extensions = await list();
    const map = await links('chrome');
    const byId = extensions.find((e) => map[e.id] === itemId) ?? extensions.find((e) => e.id === itemId)
      ?? extensions.find((e) => e.storeUrl?.includes(itemId));
    const free = extensions.filter((e) => !map[e.id] && !/[a-p]{32}/.test(e.storeUrl ?? ''));
    const source = byId ?? (title ? matchName(title, free, (e) => e.name) : null);
    if (!source) return { connected: true, source: null };
    const details = await packageDetails(source.id);
    return details === 'locked' ? { connected: true, source, locked: true } : { connected: true, source, details };
  } catch (e) {
    if (e instanceof TowerRejected) return { connected: false, invalid: true };
    throw e;
  }
}

async function listingPackage(itemId: string): Promise<TowerFile[]> {
  const res = await request(`/api/v1/extensions/${itemId}/package`);
  if (!res.ok) await failure(res);
  const { files } = await res.json() as { files: ({ path: string; text: string } | { path: string; image: string })[] };
  return Promise.all(files.map(async (file): Promise<TowerFile> => {
    if ('text' in file) return file;
    const img = await request(`/api/v1/extensions/${itemId}/package/image?src=${encodeURIComponent(file.image)}`);
    if (!img.ok) await failure(img);
    const type = img.headers.get('content-type')?.split(';')[0] === 'image/png' ? 'image/png' : 'image/jpeg';
    return { path: `${file.path}.${type === 'image/png' ? 'png' : 'jpg'}`, base64: base64(await img.arrayBuffer()), type };
  }));
}

// ---- Store pages ---------------------------------------------------------------

const FIND_MS = 10 * 60 * 1000;
const CREATE_MS = 30 * 60 * 1000; // time to upload a package for a new listing

const cached = async () => (await store.get<TowerExtension[]>('towerExtensions')) ?? [];
const known = async (id: string): Promise<TowerExtension> =>
  (await cached()).find((e) => e.id === id) ?? { id, name: 'This extension', icon: null };
const links = async (where: Store) => (await store.get<Record<string, string>>(`${where}Links`)) ?? {};

/** The store item an extension updates: its link, or on Chrome its own ID when it's published there. */
async function itemFor(where: Store, id: string): Promise<string | null> {
  const linked = (await links(where))[id];
  if (linked) return linked;
  const ext = (await cached()).find((e) => e.id === id);
  return where === 'chrome' && ext?.storeUrl?.includes(id) ? id : null;
}

async function pending(): Promise<Pending | null> {
  const p = await store.get<Pending>('pending');
  return p && Date.now() - p.at < (p.mode === 'create' ? CREATE_MS : FIND_MS) ? p : null;
}

async function hello(where: Store, itemId?: string | null, publisher?: string | null): Promise<Hello> {
  const connected = !!(await store.get<string>(KEY));
  if (where === 'chrome') {
    await store.set('chromeSeenAt', Date.now());
    if (itemId && publisher) {
      await store.set('chromePublishers', { ...(await store.get<Record<string, string>>('chromePublishers')), [itemId]: publisher });
    }
    if (publisher) await store.set('chromePublisher', publisher);
  }
  const p = await pending();
  let linked: TowerExtension | null = null;
  if (connected && itemId) {
    const map = await links(where);
    const id = Object.keys(map).find((k) => map[k] === itemId)
      ?? (await cached()).find((e) => where === 'chrome' && e.id === itemId && !map[e.id])?.id;
    if (id) linked = await known(id);
  }
  return { linked, pending: p?.store === where ? p : null };
}

async function link(where: Store, itemId: string): Promise<Hello> {
  const p = await pending();
  if (!p || p.store !== where) throw new TowerError('Choose the extension in the CWSAgent popup first.');
  const rest = Object.fromEntries(Object.entries(await links(where)).filter(([, v]) => v !== itemId));
  await store.set(`${where}Links`, { ...rest, [p.id]: itemId });
  await store.set('pending', { ...p, itemId } satisfies Pending);
  return hello(where, itemId);
}

async function open(extension: TowerExtension, where: Store) {
  const itemId = await itemFor(where, extension.id);
  await store.set('pending', { id: extension.id, name: extension.name, store: where, at: Date.now(), mode: 'find', itemId } satisfies Pending);
  let url: string;
  if (where === 'chrome') {
    const publisher = (itemId && (await store.get<Record<string, string>>('chromePublishers'))?.[itemId]) || await store.get<string>('chromePublisher');
    url = itemId && publisher ? `${CONSOLE}/${publisher}/${itemId}/edit` : CONSOLE;
  } else {
    url = itemId ? `${EDGE}/${itemId}/listings` : `${EDGE}/overview`;
  }
  await browser.tabs.create({ url });
  return {};
}

async function setMode(mode: 'pick' | 'create', existing?: string[]) {
  const p = await pending();
  if (!p) throw new TowerError('Choose the extension in the CWSAgent popup first.');
  await store.set('pending', { ...p, mode, existing, itemId: null, at: Date.now() } satisfies Pending);
  return {};
}

async function state(): Promise<TowerState> {
  return {
    connected: !!(await store.get<string>(KEY)),
    chromeSeen: !!(await store.get<number>('chromeSeenAt')),
    links: { chrome: await links('chrome'), edge: await links('edge') },
  };
}

async function handle(msg: TowerMessage): Promise<unknown> {
  switch (msg.type) {
    case 'tower:connect': {
      const key = msg.key.trim();
      if (!KEY_PATTERN.test(key)) throw new TowerError('That isn’t an Extension Tower API token.');
      await store.set(KEY, key);
      return { connected: true };
    }
    case 'tower:disconnect': await store.delete(KEY); await store.delete('towerExtensions'); return { connected: false };
    case 'tower:status': return status(msg.itemId);
    case 'tower:match': return match(msg.itemId, msg.title);
    case 'tower:package': return { files: await listingPackage(msg.itemId) };
    case 'tower:state': return state();
    case 'tower:list': return { extensions: await list() };
    case 'tower:open': return open(msg.extension, msg.store);
    case 'tower:hello': return hello(msg.store, msg.itemId, msg.publisher);
    case 'tower:link': return link(msg.store, msg.itemId);
    case 'tower:mode': return setMode(msg.mode, msg.existing);
    case 'tower:done': await store.delete('pending'); return {};
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: TowerMessage, sender, reply) => {
    if (sender.id !== browser.runtime.id || !String(msg?.type).startsWith('tower:')) return;
    handle(msg).then(reply, (e: Error) => reply({ error: e instanceof TowerError ? e.message : 'Couldn’t reach Extension Tower. Try again.' }));
    return true;
  });
});
