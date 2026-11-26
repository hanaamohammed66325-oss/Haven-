// Havi has one speech bubble: only one note above him at a time, and a quiet
// stretch after one closes before a lower-priority note may ask for him.

let holder: string | null = null;
let lastClosed = 0;

export function acquireHaviNote(kind: string): boolean {
  if (holder && holder !== kind) return false;
  holder = kind;
  return true;
}
export function releaseHaviNote(kind: string): void {
  if (holder !== kind) return;
  holder = null;
  lastClosed = Date.now();
}
export const haviNoteIdleMs = (now = Date.now()) => (holder ? 0 : now - lastClosed);
