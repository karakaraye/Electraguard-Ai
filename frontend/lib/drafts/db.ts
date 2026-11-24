/**
 * One small IndexedDB database for everything the observer app keeps on the
 * phone: the open draft, media blobs, the outbox, the minimal received index
 * (contract amendment G9) and the cached polling-unit lists (REF-01).
 * No library: a few promise wrappers around the native API.
 */

export const DB_NAME = "electraguard";
export const DB_VERSION = 1;

export type StoreName = "drafts" | "blobs" | "outbox" | "received" | "refdata";

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // One open incident draft per owner (observer code, or "citizen").
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "owner" });
      // Processed media: location already removed. Kept apart so draft writes stay small.
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "key" });
      if (!db.objectStoreNames.contains("outbox")) {
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("owner", "owner");
      }
      if (!db.objectStoreNames.contains("received")) {
        const received = db.createObjectStore("received", { keyPath: "id" });
        received.createIndex("owner", "owner");
      }
      if (!db.objectStoreNames.contains("refdata")) db.createObjectStore("refdata", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
  return dbPromise;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return done(db.transaction(store, "readonly").objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return done(db.transaction(store, "readonly").objectStore(store).getAll()) as Promise<T[]>;
}

export async function getAllByOwner<T>(store: "outbox" | "received", owner: string): Promise<T[]> {
  const db = await openDb();
  return done(db.transaction(store, "readonly").objectStore(store).index("owner").getAll(owner)) as Promise<T[]>;
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await complete(tx);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await complete(tx);
}

/** Several writes in one transaction: all happen, or none do. */
export async function atomically(stores: StoreName[], work: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(stores, "readwrite");
  work(tx);
  await complete(tx);
}

/** Remove every store's contents ("Sign out and clear this phone"). */
export async function clearAll(): Promise<void> {
  await atomically(["drafts", "blobs", "outbox", "received", "refdata"], (tx) => {
    for (const name of ["drafts", "blobs", "outbox", "received"] as const) tx.objectStore(name).clear();
  });
}

/* ---------- Blobs ---------- */

export type BlobRecord = { key: string; blob: Blob };

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await put<BlobRecord>("blobs", { key, blob });
}

export async function getBlob(key: string): Promise<Blob | null> {
  const record = await get<BlobRecord>("blobs", key);
  return record?.blob ?? null;
}
