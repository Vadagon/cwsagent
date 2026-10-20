// Small key-value store in IndexedDB of the console's origin. It keeps Blobs as
// they are (chrome.storage would need base64) and survives the console's full
// page loads between tabs.
const DB = 'cwsagent';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const store = {
  get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined),
  delete: (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined),
};
