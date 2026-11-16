// On-device copy of each business's data (IndexedDB), so the app opens with the
// last known data instantly and refreshes from Supabase in the background.
// Best effort only: any failure (private mode, quota, old browser) just means
// the app waits for the network as before.

const DB_NAME = "bw-inventory";
const STORE = "snapshots";
// Bump when the shape of the cached data changes so old snapshots are ignored.
const VERSION = "v1";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no indexedDB"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const keyOf = (userId: string, businessId: string) => `${VERSION}:${userId}:${businessId}`;

export function readSnapshot<T>(userId: string, businessId: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (s) => s.get(keyOf(userId, businessId))).catch(
    () => undefined,
  );
}

// Saves are coalesced: useDB runs in many components at once, and a burst of
// edits only needs the last state written.
const pending = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function writeSnapshot(userId: string, businessId: string, data: unknown) {
  pending.set(keyOf(userId, businessId), data);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const batch = [...pending];
    pending.clear();
    for (const [key, value] of batch) {
      run("readwrite", (s) => s.put(value, key)).catch((e) =>
        console.warn("[local-cache] save failed", e?.message ?? String(e)),
      );
    }
  }, 1000);
}

// Signing out must not leave the shop's data (or business list) readable on a shared phone.
export function clearSnapshots(): Promise<void> {
  pending.clear();
  clearCachedJSON();
  return run("readwrite", (s) => s.clear())
    .then(() => undefined)
    .catch(() => undefined);
}

// Small values (the business list) live in localStorage, readable synchronously.
const SMALL_PREFIX = "cache:";

export function readCachedJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(SMALL_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCachedJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(SMALL_PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the next open just waits for the network
  }
}

function clearCachedJSON() {
  try {
    for (const k of Object.keys(window.localStorage))
      if (k.startsWith(SMALL_PREFIX)) window.localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing was cached
  }
}
