export const WHATS_NEW_VERSION = 6;
export type WhatsNewSeen = Record<string, boolean>;
const validPage = (page: string) => /^[a-z][a-z0-9-]{0,39}$/.test(page);
export const whatsNewPrefKey = (version: number, page?: string) => `whatsNewSeen_v${version}${page ? `_${page}` : ""}`;
export function readWhatsNewSeen(prefs: Record<string, unknown>): WhatsNewSeen {
  return Object.fromEntries(Object.entries(prefs).filter(([key, value]) => /^whatsNewSeen_v[1-9]\d*(?:_[a-z][a-z0-9-]{0,39})?$/.test(key) && value === true).map(([key]) => [key, true]));
}
export function hasSeenWhatsNew(seen: WhatsNewSeen, version = WHATS_NEW_VERSION): boolean {
  return seen[whatsNewPrefKey(version)] === true;
}

/** Never acknowledge a write in a different account after an async response. */
export async function saveWhatsNewSeen(version: number, account: string | null,
  current: () => string | null, save: (patch: Record<string, unknown>) => Promise<void>, page?: string): Promise<boolean> {
  if (!account || current() !== account || !Number.isSafeInteger(version) || version < 1 || (page !== undefined && !validPage(page))) return false;
  try {
    await save({ [whatsNewPrefKey(version, page)]: true });
    return current() === account;
  } catch { return false; }
}
