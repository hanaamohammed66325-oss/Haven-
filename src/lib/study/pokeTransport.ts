/** Provider-neutral seam: a Cloudflare adapter can implement this same contract. */
export interface PokeSender {
  send(target: string, tap: string, recipients: readonly string[]): Promise<boolean>;
}

/** The same id is reused on fallback, so an ambiguous acknowledgement cannot double-play. */
export async function sendPoke(sender: PokeSender | null, target: string, tap: string, recipients: readonly string[], fallback: () => Promise<boolean>, current: () => boolean) {
  if (!current()) return false;
  try { if (sender && await sender.send(target, tap, recipients)) return true; } catch { /* Preserve RPC fallback. */ }
  return current() ? fallback() : false;
}
