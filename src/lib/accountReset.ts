/** Account-data generations fence old clients without touching authentication. */
export interface DataRecoverySnapshot { id: string; createdAt: string; expiresAt: string; kind: "reset" | "restore"; sourceId: string | null }
export interface DataRecoveryState { available: boolean; generation: number; snapshots: DataRecoverySnapshot[]; latest: DataRecoverySnapshot | null }
let account: string | null = null;
let generation: number | null = null;
let changing = false;
const writes = new Set<Promise<unknown>>();
const participants = new Set<() => Promise<void> | void>();
export const DATA_QUIESCE_EVENT = "haven-account-data-quiesce";
export const DATA_CHANGE_EVENT = "haven-account-data-change";
export function accountDataChanging() { return changing; }
export function deviceDataWriteAllowed() {
  if (changing) return false;
  if (!account || typeof localStorage === "undefined") return true;
  return localDataWriteAllowed(`account:${account}`);
}
export function currentDataGeneration(id: string) { return account === id ? generation : null; }
export function localDataWriteAllowed(scope: string) {
  if (!scope.startsWith("account:") || typeof localStorage === "undefined") return !changing;
  const id = scope.slice(8), stamp = localStorage.getItem(`haven-data-generation:${id}`);
  if (!stamp) return !changing;
  if (stamp.startsWith("pending:")) return false;
  return !changing && Number(stamp) === currentDataGeneration(id);
}
export function withDeviceDataLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("haven-device-data", work);
  return work();
}
export function bindAccountGeneration(id: string | null, next: number | null) {
  account = id; generation = next;
}
export function onAccountDataQuiesce(work: () => Promise<void> | void) { participants.add(work); return () => { participants.delete(work); }; }
export function dataRequestHeaders(headers: HeadersInit | undefined): Headers {
  const out = new Headers(headers);
  if (account && generation !== null) out.set("x-haven-data-generation", String(generation));
  return out;
}
export function trackAccountWrite<T>(promise: Promise<T>): Promise<T> {
  writes.add(promise);
  void promise.then(() => writes.delete(promise), () => writes.delete(promise));
  return promise;
}
export function isRecoveryRequest(url: string) { return /\/rpc\/account_data_(?:status|reset|restore)$/.test(url.split("?")[0]); }
export function parseRecoveryState(value: unknown): DataRecoveryState {
  const s = value as DataRecoveryState;
  if (!s || !Number.isSafeInteger(s.generation) || s.generation < 0 || !Array.isArray(s.snapshots)) throw Error("invalid_recovery_state");
  for (const row of [...s.snapshots, ...(s.latest ? [s.latest] : [])]) {
    if (!/^[0-9a-f-]{36}$/i.test(row.id) || !["reset", "restore"].includes(row.kind)
      || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.expiresAt))
      || (row.sourceId !== null && !/^[0-9a-f-]{36}$/i.test(row.sourceId))) throw Error("invalid_recovery_snapshot");
  }
  return { ...s, available: true };
}
export async function readDataRecovery(): Promise<DataRecoveryState> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("account_data_status");
  // Expand-first rollout: older production schema remains fully usable. The
  // destructive button stays disabled until the reviewed migration exists.
  if (error?.code === "PGRST202" || error?.code === "42883") return { available: false, generation: 0, snapshots: [], latest: null };
  if (error) throw Error("recovery_unavailable");
  return parseRecoveryState(data);
}
export async function initializeAccountData(id: string) {
  bindAccountGeneration(id, null);
  let state = await readDataRecovery();
  if (state.available) {
    const { pendingLocalDataChange, cancelLocalDataChange, reconcileLocalData } = await import("./accountResetLocal");
    await withDeviceDataLock(async () => {
      // Retry the exact previously authorized operation after a closed tab or
      // lost response. Its durable ID makes this safe even if it committed.
      const pending = await pendingLocalDataChange(id);
      if (pending && pending.expected === state.generation && state.latest?.id !== pending.id) {
        const { supabase } = await import("./supabase");
        const result = await supabase.rpc(pending.sourceId ? "account_data_restore" : "account_data_reset", {
          p_operation: pending.id, p_expected_generation: pending.expected, p_expected_user: id,
          ...(pending.sourceId ? { p_snapshot: pending.sourceId } : {}),
        });
        if (result.error) {
          if (!["42501", "40001"].includes(result.error.code)) throw Error("reset_unconfirmed");
          state = await readDataRecovery();
          await cancelLocalDataChange(id, state.generation, pending.id);
        } else state = parseRecoveryState(result.data);
      } else state = await readDataRecovery();
      await reconcileLocalData(id, state);
    });
  }
  if (account !== id) throw Error("account_changed");
  bindAccountGeneration(id, state.generation);
  return state;
}
/** The UI never reports success before the durable server/local journal settles. */
export async function changeAccountData(id: string, sourceId: string | null = null): Promise<DataRecoveryState> {
  if (changing || !id || account !== id) throw Error("reset_busy");
  changing = true;
  let serverCommitted = false;
  let uncertain = false;
  let operation: string | null = null;
  const expected = generation;
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_QUIESCE_EVENT));
    await Promise.all([...participants].map(work => work()));
    await Promise.all([...writes]);
    const { clearActiveRoom } = await import("./study/activeRoom");
    clearActiveRoom();
    const state = await readDataRecovery();
    if (!state.available || state.generation !== generation) throw Error("reset_stale");
    if (sourceId && !state.snapshots.some(s => s.id === sourceId && Date.parse(s.expiresAt) > Date.now())) throw Error("reset_expired");
    const { prepareLocalDataChange, commitLocalDataChange } = await import("./accountResetLocal");
    if (typeof navigator === "undefined" || !navigator.locks) throw Error("reset_device_unavailable");
    return await withDeviceDataLock(async () => {
    operation = await prepareLocalDataChange(id, state, sourceId);
    if (account !== id) throw Error("account_changed");
    const { supabase } = await import("./supabase");
    const args = { p_operation: operation, p_expected_generation: state.generation, p_expected_user: id, ...(sourceId ? { p_snapshot: sourceId } : {}) };
    uncertain = true;
    const result = await supabase.rpc(sourceId ? "account_data_restore" : "account_data_reset", args);
    if (result.error) {
      // A lost response may have committed. Read the durable operation before
      // deciding whether a retry is safe; never issue a second operation.
      const confirmed = await readDataRecovery();
      if (confirmed.latest?.id !== operation) {
        if (confirmed.generation === state.generation && ["42501", "40001"].includes(result.error.code)) {
          const { cancelLocalDataChange } = await import("./accountResetLocal");
          await cancelLocalDataChange(id, state.generation, operation);
          operation = null;
          uncertain = false;
          throw Error("reset_failed");
        }
        throw Error("reset_unconfirmed");
      }
    }
    const next = result.error ? await readDataRecovery() : parseRecoveryState(result.data);
    if (next.latest?.id !== operation) throw Error("reset_unconfirmed");
    serverCommitted = true;
    await commitLocalDataChange(id, next);
    if (account !== id) throw Error("account_changed");
    bindAccountGeneration(id, next.generation);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGE_EVENT));
    return next;
    });
  } catch (error) {
    // If the server committed, keep writes fenced until retry/reload reconciles
    // the journal. Do not let an old React snapshot recreate erased data.
    if (serverCommitted) throw Error("reset_device_pending");
    if (uncertain) throw Error("reset_unconfirmed");
    if (operation && expected !== null) {
      try { const { cancelLocalDataChange } = await import("./accountResetLocal"); await cancelLocalDataChange(id, expected, operation); }
      catch { throw Error("reset_device_pending"); }
    }
    changing = false;
    throw error;
  }
}
