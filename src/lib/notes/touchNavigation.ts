export type NavigationContact = { x: number; y: number; width: number; height: number };
/** Contact size is advisory: a broad finger must still participate in a pinch. */
export function isUnambiguousPalm(width: number, height: number): boolean {
  return Math.max(width, height) >= 90 || Math.max(width, height) >= 45 && Math.max(width, height) / Math.max(1, Math.min(width, height)) > 2.5;
}
export function canPinch(contacts: readonly NavigationContact[], penActive: boolean): boolean {
  if (penActive || contacts.length !== 2 || contacts.some(point => isUnambiguousPalm(point.width, point.height))) return false;
  return Math.hypot(contacts[0].x - contacts[1].x, contacts[0].y - contacts[1].y) >= 35;
}
