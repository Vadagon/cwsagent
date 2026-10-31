// Content-script side of the Extension Tower connection. The background worker
// holds the key and makes the requests; this side only asks it.
import type { FileEntry } from './types';

export type Store = 'chrome' | 'edge';
export type TowerExtension = { id: string; name: string; icon: string | null; storeUrl?: string };
/**
 * A one-click update in progress: the popup opened a store page for this
 * extension. itemId is the store item it's linked to, or null while the page
 * has to find it. "pick": the user opens the item and presses Link. "create":
 * the user is making a new listing; the first item page that isn't one of the
 * `existing` items gets linked.
 */
export type Pending = {
  id: string; name: string; store: Store; at: number; itemId: string | null;
  mode: 'find' | 'pick' | 'create'; existing?: string[];
};
/** What a store page learns about itself: the Extension Tower extension it belongs to, and any pending update. */
export type Hello = { linked: TowerExtension | null; pending: Pending | null };

export type TowerMessage =
  | { type: 'tower:connect'; key: string }
  | { type: 'tower:disconnect' }
  | { type: 'tower:status'; itemId: string }
  | { type: 'tower:match'; itemId: string; title?: string | null }
  | { type: 'tower:package'; itemId: string }
  | { type: 'tower:state' }
  | { type: 'tower:list' }
  | { type: 'tower:open'; extension: TowerExtension; store: Store }
  | { type: 'tower:hello'; store: Store; itemId?: string | null; publisher?: string | null }
  | { type: 'tower:link'; store: Store; itemId: string }
  | { type: 'tower:mode'; mode: 'pick' | 'create'; existing?: string[] }
  | { type: 'tower:done' };
export type TowerStatus = { connected: boolean; available?: boolean };
/** The listing in the account that a console item belongs to. invalid: Extension Tower rejected the saved token. */
export type TowerMatch = { connected: boolean; invalid?: boolean; source?: TowerExtension | null; details?: TowerDetails; locked?: boolean };
/** What Sync would bring from the listing, read from its package. */
export type TowerDetails = { languages: number; screenshots: number; icon: boolean; smallTile: boolean; marquee: boolean; category?: string; privacy: boolean };
export type TowerState = { connected: boolean; chromeSeen: boolean; links: Record<Store, Record<string, string>> };
export type TowerFile = { path: string; text: string } | { path: string; base64: string; type: string };

/** False outside the extension (the mock console runs the bundle as a plain page). */
export const towerReady = () => !!(globalThis as any).chrome?.runtime?.id;

async function ask<T>(msg: TowerMessage): Promise<T> {
  const res = await (globalThis as any).chrome.runtime.sendMessage(msg) as (T & { error?: string }) | undefined;
  if (!res) throw new Error('CWSAgent was updated. Reload this page.');
  if (res.error) throw new Error(res.error);
  return res;
}

export const towerConnect = (key: string) => ask<TowerStatus>({ type: 'tower:connect', key });
export const towerDisconnect = () => ask<TowerStatus>({ type: 'tower:disconnect' });
export const towerStatus = (itemId: string) => ask<TowerStatus>({ type: 'tower:status', itemId });
export const towerMatch = (itemId: string, title?: string | null) => ask<TowerMatch>({ type: 'tower:match', itemId, title });

/** The item's listing from Extension Tower, as files for buildPackage. */
export async function towerFiles(itemId: string): Promise<FileEntry[]> {
  const { files } = await ask<{ files: TowerFile[] }>({ type: 'tower:package', itemId });
  return files.map((f) => {
    if ('text' in f) return { path: f.path, blob: new Blob([f.text], { type: 'text/plain' }) };
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    return { path: f.path, blob: new Blob([bytes], { type: f.type }) };
  });
}

export const towerHello = (store: Store, itemId?: string | null, publisher?: string | null) =>
  ask<Hello>({ type: 'tower:hello', store, itemId, publisher });
export const towerLink = (store: Store, itemId: string) => ask<Hello>({ type: 'tower:link', store, itemId });
export const towerMode = (mode: 'pick' | 'create', existing?: string[]) => ask<unknown>({ type: 'tower:mode', mode, existing });
export const towerDone = () => ask<unknown>({ type: 'tower:done' });
export const towerState = () => ask<TowerState>({ type: 'tower:state' });
export const towerList = () => ask<{ extensions: TowerExtension[] }>({ type: 'tower:list' });
export const towerOpen = (extension: TowerExtension, store: Store) => ask<unknown>({ type: 'tower:open', extension, store });
