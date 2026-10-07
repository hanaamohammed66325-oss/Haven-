export const WHATS_NEW_VERSION = 5;
export type WhatsNewSeen = Record<string, boolean>;
export const whatsNewPrefKey = (version: number) => `whatsNewSeen_v${version}`;
export function readWhatsNewSeen(prefs: Record<string, unknown>): WhatsNewSeen {
  return Object.fromEntries(Object.entries(prefs).filter(([key, value]) => /^whatsNewSeen_v[1-9]\d*$/.test(key) && value === true).map(([key]) => [key, true]));
}
export function hasSeenWhatsNew(seen: WhatsNewSeen, version = WHATS_NEW_VERSION): boolean {
  return seen[whatsNewPrefKey(version)] === true;
}

/** Never acknowledge a write in a different account after an async response. */
export async function saveWhatsNewSeen(version: number, account: string | null,
  current: () => string | null, save: (patch: Record<string, unknown>) => Promise<void>): Promise<boolean> {
  if (!account || current() !== account || !Number.isSafeInteger(version) || version < 1) return false;
  try {
    await save({ [whatsNewPrefKey(version)]: true });
    return current() === account;
  } catch { return false; }
}
