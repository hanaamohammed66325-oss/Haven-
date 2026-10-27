import type { DataRecoveryState } from "./accountReset";
import { currentDataGeneration } from "./accountReset";

interface StoredRow { key: IDBValidKey; value: Record<string, unknown> | Blob }
interface DeviceData { libraries: StoredRow[]; assets: StoredRow[]; tracks: StoredRow[]; files: StoredRow[]; preferences: [string, string][] }
interface LocalSnapshot { id: string; account: string; createdAt: string; expiresAt: string; data: DeviceData; sourceId: string | null; expected: number }
interface Meta { account: string; generation: number; pending?: string }
const ARCHIVE_DB = "haven-account-recovery";
const empty = (): DeviceData => ({ libraries: [], assets: [], tracks: [], files: [], preferences: [] });
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = name === "haven-notes" || name === "haven-study-audio" ? indexedDB.open(name, 2) : indexedDB.open(name);
    let blocked = false;
    r.onupgradeneeded = () => {
      if (name === ARCHIVE_DB) { r.result.createObjectStore("snapshots", { keyPath: "id" }); r.result.createObjectStore("meta", { keyPath: "account" }); }
      if (name === "haven-notes") {
        if (!r.result.objectStoreNames.contains("libraries")) r.result.createObjectStore("libraries", { keyPath: "scope" });
        if (!r.result.objectStoreNames.contains("assets")) r.result.createObjectStore("assets", { keyPath: ["scope", "id"] });
      }
      if (name === "haven-study-audio") {
        if (!r.result.objectStoreNames.contains("tracks")) r.result.createObjectStore("tracks", { keyPath: "id" });
        if (!r.result.objectStoreNames.contains("files")) r.result.createObjectStore("files");
      }
    };
    r.onblocked = () => { blocked = true; reject(Error("local_recovery_blocked")); };
    r.onerror = () => reject(r.error ?? Error("local_recovery_failed"));
    r.onsuccess = () => { if (blocked) r.result.close(); else { r.result.onversionchange = () => r.result.close(); resolve(r.result); } };
  });
}
async function transaction<T>(name: string, stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, done: (v: T) => void) => void): Promise<T> {
  const db = await open(name);
  return new Promise((resolve, reject) => {
    let value: T;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(tx.error ?? Error("local_recovery_failed")); };
    tx.onerror = () => {};
    try { work(tx, v => { value = v; }); } catch (error) { tx.abort(); db.close(); reject(error); }
  });
}
function archiveGet<T>(store: string, id: string) {
  return transaction<T | undefined>(ARCHIVE_DB, [store], "readonly", (tx, done) => {
    const r = tx.objectStore(store).get(id); r.onsuccess = () => done(r.result);
  });
}
function localPreferenceKeys(account: string) {
  const keys: string[] = [], scope = `account:${account}`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && ((k.startsWith("haven-notes") && k.includes(scope)) || k === "haven-study-audio-prefs")) keys.push(k);
  }
  return keys;
}
function readRows(tx: IDBTransaction, store: string, filter: (row: StoredRow) => boolean, done: (rows: StoredRow[]) => void) {
  const rows: StoredRow[] = [], cursor = tx.objectStore(store).openCursor();
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (!c) { done(rows); return; }
    const row = { key: c.key, value: c.value };
    if (filter(row)) rows.push(row);
    c.continue();
  };
}
async function capture(account: string): Promise<DeviceData> {
  const scope = `account:${account}`, data = empty();
  await transaction("haven-notes", ["libraries", "assets"], "readonly", (tx, done) => {
    let pending = 2;
    for (const store of ["libraries", "assets"] as const) readRows(tx, store,
      row => (row.value as { scope?: string }).scope === scope,
      rows => { data[store] = rows; if (!--pending) done(undefined); });
  });
  await transaction("haven-study-audio", ["tracks", "files"], "readonly", (tx, done) => {
    let pending = 2;
    // Audio is explicitly device-only, unlike account-owned Notes.
    for (const store of ["tracks", "files"] as const) readRows(tx, store, () => true,
      rows => { data[store] = rows; if (!--pending) done(undefined); });
  });
  data.preferences = localPreferenceKeys(account).map(k => [k, localStorage.getItem(k)!]);
  return data;
}
async function replace(account: string, data: DeviceData) {
  const scope = `account:${account}`;
  await transaction("haven-notes", ["libraries", "assets"], "readwrite", (tx, done) => {
    let pending = 2;
    for (const store of ["libraries", "assets"] as const) {
      const cursor = tx.objectStore(store).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) { if (c.value.scope === scope) c.delete(); c.continue(); return; }
        for (const row of data[store]) {
          if ((row.value as { scope?: string }).scope !== scope) { tx.abort(); return; }
          tx.objectStore(store).put(row.value);
        }
        if (!--pending) done(undefined);
      };
    }
  });
  await transaction("haven-study-audio", ["tracks", "files"], "readwrite", (tx, done) => {
    for (const store of ["tracks", "files"] as const) {
      tx.objectStore(store).clear();
      for (const row of data[store]) {
        if (store === "files") tx.objectStore(store).put(row.value, row.key);
        else tx.objectStore(store).put(row.value);
      }
    }
    done(undefined);
  });
  for (const k of localPreferenceKeys(account)) localStorage.removeItem(k);
  for (const [k, v] of data.preferences) {
    if (!((k.startsWith("haven-notes") && k.includes(scope)) || k === "haven-study-audio-prefs")) throw Error("invalid_local_scope");
    localStorage.setItem(k, v);
  }
}
/** Prepare persists a full device snapshot before any cloud data can change. */
export async function prepareLocalDataChange(account: string, state: DataRecoveryState, sourceId: string | null): Promise<string> {
  const meta = await archiveGet<Meta>("meta", account);
  const existing = meta?.pending ? await archiveGet<LocalSnapshot>("snapshots", meta.pending) : null;
  if (existing?.account === account && existing.expected === state.generation && existing.sourceId === sourceId) return existing.id;
  if (meta?.pending) throw Error("reset_device_pending");
  const id = crypto.randomUUID(), now = Date.now();
  const key = `haven-data-generation:${account}`, previous = localStorage.getItem(key), stamp = `pending:${id}`;
  localStorage.setItem(key, stamp);
  try {
  const record: LocalSnapshot = { id, account, expected: state.generation, sourceId,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), data: await capture(account) };
  await transaction(ARCHIVE_DB, ["snapshots", "meta"], "readwrite", (tx, done) => {
    tx.objectStore("snapshots").put(record);
    tx.objectStore("meta").put({ account, generation: state.generation, pending: id });
    done(undefined);
  });
  return id;
  } catch (error) {
    if (localStorage.getItem(key) === stamp) {
      if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
    }
    throw error;
  }
}
export async function commitLocalDataChange(account: string, state: DataRecoveryState): Promise<void> {
  const change = state.latest;
  if (!change) throw Error("missing_data_change");
  const before = await archiveGet<LocalSnapshot>("snapshots", change.id);
  if (!before || before.account !== account) throw Error("missing_local_journal");
  // Source blobs may exist only on the original device. Their absence never
  // substitutes another account's/device's library into this account.
  const source = change.sourceId ? await archiveGet<LocalSnapshot>("snapshots", change.sourceId) : null;
  const target = source?.account === account && Date.parse(source.expiresAt) > Date.now() ? source.data : empty();
  await replace(account, target);
  await transaction(ARCHIVE_DB, ["snapshots", "meta"], "readwrite", (tx, done) => {
    tx.objectStore("snapshots").put({ ...before, createdAt: change.createdAt, expiresAt: change.expiresAt });
    tx.objectStore("meta").put({ account, generation: state.generation });
    done(undefined);
  });
  localStorage.setItem(`haven-data-generation:${account}`, String(state.generation));
}
export async function pendingLocalDataChange(account: string) {
  const meta = await archiveGet<Meta>("meta", account);
  const pending = meta?.pending ? await archiveGet<LocalSnapshot>("snapshots", meta.pending) : null;
  return pending?.account === account ? pending : null;
}
export async function cancelLocalDataChange(account: string, generation: number, operation: string) {
  const cancelled = await transaction<boolean>(ARCHIVE_DB, ["meta"], "readwrite", (tx, done) => {
    const store = tx.objectStore("meta"), r = store.get(account);
    r.onsuccess = () => {
      if (r.result?.pending !== operation) { done(false); return; }
      store.put({ account, generation }); done(true);
    };
  });
  if (cancelled) localStorage.setItem(`haven-data-generation:${account}`, String(generation));
}
export async function assertLocalScopeGeneration(scope: string) {
  if (!scope.startsWith("account:")) return;
  const account = scope.slice(8), meta = await archiveGet<Meta>("meta", account);
  if (meta?.pending || (meta && meta.generation > 0 && currentDataGeneration(account) !== meta.generation)) throw Error("local_data_changed");
}
export async function reconcileLocalData(account: string, state: DataRecoveryState): Promise<void> {
  const meta = await archiveGet<Meta>("meta", account);
  if (meta?.pending && state.latest?.id !== meta.pending && meta.generation === state.generation) throw Error("reset_device_pending");
  if ((meta?.generation ?? 0) !== state.generation && state.latest) {
    const existing = await archiveGet<LocalSnapshot>("snapshots", state.latest.id);
    if (!existing) {
      const latest = state.latest;
      const data = await capture(account);
      await transaction(ARCHIVE_DB, ["snapshots"], "readwrite", (tx, done) => {
        tx.objectStore("snapshots").put({ ...latest, account, expected: meta?.generation ?? 0, data }); done(undefined);
      });
    }
    await commitLocalDataChange(account, state);
  } else if (!meta) await transaction(ARCHIVE_DB, ["meta"], "readwrite", (tx, done) => { tx.objectStore("meta").put({ account, generation: state.generation }); done(undefined); });
  await transaction(ARCHIVE_DB, ["snapshots"], "readwrite", (tx, done) => {
    const r = tx.objectStore("snapshots").openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) { done(undefined); return; }
      if (c.value.account === account && Date.parse(c.value.expiresAt) <= Date.now()) c.delete(); c.continue(); };
  });
  localStorage.setItem(`haven-data-generation:${account}`, String(state.generation));
}
