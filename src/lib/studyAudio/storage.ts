/** Device-only storage. Metadata lists never load the recordings into memory. */
import { deviceDataWriteAllowed, withDeviceDataLock } from "../accountReset";
export interface PersonalTrack { id: string; name: string; size: number; temporary?: boolean }
const DB_NAME = "haven-study-audio";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("tracks")) request.result.createObjectStore("tracks", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else { request.result.onversionchange = () => request.result.close(); resolve(request.result); }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("storage_blocked")); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(["tracks", "files"], mode);
    let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("storage_failed")); };
    tx.onerror = () => {}; // Abort is the terminal failure, including quota errors.
    try { work(tx, (value) => { result = value; }); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
}
export function listPersonalTracks(): Promise<PersonalTrack[]> {
  return transaction("readonly", (tx, done) => {
    const request = tx.objectStore("tracks").getAll();
    request.onsuccess = () => done(request.result as PersonalTrack[]);
  });
}
export function savePersonalTrack(track: PersonalTrack, file: Blob): Promise<void> {
  return withDeviceDataLock(async () => {
  if (!deviceDataWriteAllowed()) throw Error("local_data_changed");
  return transaction("readwrite", (tx, done) => {
    tx.objectStore("tracks").put(track);
    tx.objectStore("files").put(file, track.id);
    done(undefined);
  });
  });
}
export function readPersonalFile(id: string): Promise<Blob | undefined> {
  return transaction("readonly", (tx, done) => {
    const request = tx.objectStore("files").get(id);
    request.onsuccess = () => done(request.result as Blob | undefined);
  });
}
export function deletePersonalTrack(id: string): Promise<void> {
  return withDeviceDataLock(async () => {
  if (!deviceDataWriteAllowed()) throw Error("local_data_changed");
  return transaction("readwrite", (tx, done) => {
    tx.objectStore("tracks").delete(id);
    tx.objectStore("files").delete(id);
    done(undefined);
  });
  });
}
