// Persistenter Thumbnail-Cache (PNG-Data-URLs) in IndexedDB.
// Ermöglicht das sofortige Anzeigen der Miniaturen auch nach einem Reload.
// Fällt bei fehlendem IndexedDB (SSR, Privatmodus) still auf No-Ops zurück.

// Schema-/Cache-Version. Bei inkompatiblen Änderungen am Rendering oder am
// Key-Format erhöhen – alte Einträge werden dann ignoriert und aufgeräumt.
export const THUMB_CACHE_VERSION = 1;

const DB_NAME = "pdf-thumb-cache";
const DB_VERSION = 1;
const STORE = "thumbnails";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// Baut den vollständigen, versionierten Cache-Key für Dokument+Version+Seite.
// `docId` identifiziert das Dokument (storageKey/url), `version` ist ein
// inhaltsabhängiger Fingerprint, der sich bei jeder PDF-Änderung ändert.
export function buildThumbKey(docId: string, version: string, page: number): string {
  return `v${THUMB_CACHE_VERSION}:${docId}:${version}:p${page}`;
}

// Präfix aller Einträge eines Dokuments (unabhängig von Version/Seite) für die
// aktuelle Cache-Version.
export function thumbDocPrefix(docId: string): string {
  return `v${THUMB_CACHE_VERSION}:${docId}:`;
}

export async function idbGetThumb(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSetThumb(key: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Entfernt veraltete Einträge: alle Schlüssel einer früheren Cache-Version
// sowie alle Einträge desselben Dokuments, deren Version vom aktuellen
// Fingerprint abweicht (z. B. nach einer PDF-Änderung).
export async function idbPruneStale(docId: string, currentVersion: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const validDocPrefix = thumbDocPrefix(docId);
  const currentPrefix = `${validDocPrefix}${currentVersion}:`;
  const versionPrefix = `v${THUMB_CACHE_VERSION}:`;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        const isOldVersion = !key.startsWith(versionPrefix);
        const isStaleForThisDoc =
          key.startsWith(validDocPrefix) && !key.startsWith(currentPrefix);
        if (isOldVersion || isStaleForThisDoc) {
          store.delete(cursor.key);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Löscht alle Cache-Einträge eines bestimmten Dokuments (alle Versionen, alle
// Seiten) aus IndexedDB – z. B. wenn der Nutzer die Miniaturen neu rendern will.
export async function idbClearDocThumbs(docId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const prefix = thumbDocPrefix(docId);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix)) {
          store.delete(cursor.key);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
