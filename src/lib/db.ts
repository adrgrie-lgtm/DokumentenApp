// Lokale Datenschicht (IndexedDB): ersetzt Supabase vollständig.
// Alle Dokumente, Dateien, Analysen, Chatverläufe und Stammdaten bleiben
// ausschließlich in diesem Browser. Kein Server, kein Konto, kein Sync.

import type { DocumentCategory, DocumentStatus } from "./categories";

export interface LocalDocument {
  id: string;
  title: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  category: DocumentCategory;
  status: DocumentStatus;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface Deadline {
  label: string;
  date: string | null;
  description: string;
}

export interface Contact {
  name: string;
  role: string;
  details: string;
}

export interface RequiredField {
  name: string;
  explanation: string;
  filled: boolean;
  value: string | null;
}

export interface LocalAnalysis {
  id: string;
  document_id: string;
  doc_type: string | null;
  summary: string | null;
  deadlines: Deadline[];
  contacts: Contact[];
  required_fields: RequiredField[];
  missing_info: string[];
  field_explanations: { field: string; explanation: string }[];
  created_at: string;
}

export interface ChatMessage {
  id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface MasterData {
  first_name: string;
  last_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  birth_date: string;
  phone: string;
  email: string;
  marital_status: string;
  children_count: number;
  iban: string;
  bic: string;
  bank_name: string;
  id_card_number: string;
  tax_id: string;
}

export const EMPTY_MASTER: MasterData = {
  first_name: "",
  last_name: "",
  street: "",
  house_number: "",
  postal_code: "",
  city: "",
  country: "Deutschland",
  birth_date: "",
  phone: "",
  email: "",
  marital_status: "",
  children_count: 0,
  iban: "",
  bic: "",
  bank_name: "",
  id_card_number: "",
  tax_id: "",
};

const DB_NAME = "oneclick-dokumente";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB wird nicht unterstützt."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("documents")) {
          db.createObjectStore("documents", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("analyses")) {
          const store = db.createObjectStore("analyses", { keyPath: "id" });
          store.createIndex("by_document", "document_id", { unique: false });
        }
        if (!db.objectStoreNames.contains("chat")) {
          const store = db.createObjectStore("chat", { keyPath: "id" });
          store.createIndex("by_document", "document_id", { unique: false });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Datenbankfehler."));
    });
  }
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        try {
          const t = db.transaction(store, mode);
          const req = run(t.objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error("Datenbankfehler."));
        } catch (e) {
          reject(e);
        }
      }),
  );
}

function getAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, "readonly", (s) => s.getAll());
}

function getAllByIndex<T>(store: string, index: string, key: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        try {
          const t = db.transaction(store, "readonly");
          const req = t.objectStore(store).index(index).getAll(key);
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error ?? new Error("Datenbankfehler."));
        } catch (e) {
          reject(e);
        }
      }),
  );
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const nowIso = () => new Date().toISOString();

// ---- Dokumente + Dateien ----

export async function listDocuments(): Promise<LocalDocument[]> {
  const docs = await getAll<LocalDocument>("documents");
  return docs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getDocument(id: string): Promise<LocalDocument | null> {
  return tx<LocalDocument | undefined>("documents", "readonly", (s) => s.get(id)).then(
    (d) => d ?? null,
  );
}

export async function saveDocumentWithFile(
  meta: Omit<LocalDocument, "created_at" | "updated_at">,
  bytes: ArrayBuffer,
): Promise<LocalDocument> {
  const doc: LocalDocument = { ...meta, created_at: nowIso(), updated_at: nowIso() };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(["documents", "files"], "readwrite");
    t.objectStore("documents").put(doc);
    t.objectStore("files").put({ id: doc.id, bytes });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("Speichern fehlgeschlagen."));
    t.onabort = () => reject(t.error ?? new Error("Speichern fehlgeschlagen."));
  });
  return doc;
}

export async function updateDocument(id: string, patch: Partial<LocalDocument>): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  const next = { ...doc, ...patch, id, updated_at: nowIso() };
  await tx("documents", "readwrite", (s) => s.put(next));
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(["documents", "files", "analyses", "chat"], "readwrite");
    t.objectStore("documents").delete(id);
    t.objectStore("files").delete(id);
    const delByDoc = (store: string) => {
      const idx = t.objectStore(store).index("by_document");
      const req = idx.openKeyCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        t.objectStore(store).delete(cur.primaryKey);
        cur.continue();
      };
    };
    delByDoc("analyses");
    delByDoc("chat");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("Löschen fehlgeschlagen."));
    t.onabort = () => reject(t.error ?? new Error("Löschen fehlgeschlagen."));
  });
}

export async function getFileBytes(id: string): Promise<ArrayBuffer | null> {
  const row = await tx<{ id: string; bytes: ArrayBuffer } | undefined>("files", "readonly", (s) =>
    s.get(id),
  );
  return row?.bytes ?? null;
}

// ---- Analysen ----

export async function getLatestAnalysis(documentId: string): Promise<LocalAnalysis | null> {
  const rows = await getAllByIndex<LocalAnalysis>("analyses", "by_document", documentId);
  if (!rows.length) return null;
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows[0];
}

export async function saveAnalysis(
  a: Omit<LocalAnalysis, "id" | "created_at">,
): Promise<LocalAnalysis> {
  const row: LocalAnalysis = { ...a, id: uid(), created_at: nowIso() };
  await tx("analyses", "readwrite", (s) => s.put(row));
  return row;
}

// ---- Chat ----

export async function listChat(documentId: string): Promise<ChatMessage[]> {
  const rows = await getAllByIndex<ChatMessage>("chat", "by_document", documentId);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addChatMessage(
  m: Omit<ChatMessage, "id" | "created_at">,
): Promise<ChatMessage> {
  const row: ChatMessage = { ...m, id: uid(), created_at: nowIso() };
  await tx("chat", "readwrite", (s) => s.put(row));
  return row;
}

// ---- Schlüssel/Werte (Stammdaten) ----

export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await tx<{ key: string; value: T } | undefined>("kv", "readonly", (s) => s.get(key));
  return row?.value ?? null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put({ key, value }));
}

export async function getMasterData(): Promise<MasterData> {
  const stored = await kvGet<Partial<MasterData>>("master_data");
  return { ...EMPTY_MASTER, ...(stored ?? {}) };
}

export async function setMasterData(data: MasterData): Promise<void> {
  await kvSet("master_data", data);
}

// ---- Export / Import / Löschen ----

export interface LocalBackup {
  version: 1;
  exported_at: string;
  documents: LocalDocument[];
  files: { id: string; base64: string }[];
  analyses: LocalAnalysis[];
  chat: ChatMessage[];
  master_data: MasterData | null;
}

/** ArrayBuffer → Base64 (stückweise, damit große Dateien den Stack nicht sprengen). */
export function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    bin += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export async function exportBackup(): Promise<LocalBackup> {
  const documents = await getAll<LocalDocument>("documents");
  const filesRaw = await getAll<{ id: string; bytes: ArrayBuffer }>("files");
  return {
    version: 1,
    exported_at: nowIso(),
    documents,
    files: filesRaw.map((f) => ({ id: f.id, base64: bytesToBase64(f.bytes) })),
    analyses: await getAll<LocalAnalysis>("analyses"),
    chat: await getAll<ChatMessage>("chat"),
    master_data: await kvGet<MasterData>("master_data"),
  };
}

export async function importBackup(backup: LocalBackup): Promise<void> {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.documents)) {
    throw new Error("Ungültige Sicherungsdatei.");
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(["documents", "files", "analyses", "chat", "kv"], "readwrite");
    for (const d of backup.documents) t.objectStore("documents").put(d);
    for (const f of backup.files ?? []) {
      t.objectStore("files").put({ id: f.id, bytes: base64ToBytes(f.base64) });
    }
    for (const a of backup.analyses ?? []) t.objectStore("analyses").put(a);
    for (const m of backup.chat ?? []) t.objectStore("chat").put(m);
    if (backup.master_data)
      t.objectStore("kv").put({ key: "master_data", value: backup.master_data });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("Import fehlgeschlagen."));
    t.onabort = () => reject(t.error ?? new Error("Import fehlgeschlagen."));
  });
}

export async function clearAllData(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(["documents", "files", "analyses", "chat", "kv"], "readwrite");
    for (const name of ["documents", "files", "analyses", "chat", "kv"]) {
      t.objectStore(name).clear();
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("Löschen fehlgeschlagen."));
    t.onabort = () => reject(t.error ?? new Error("Löschen fehlgeschlagen."));
  });
}
