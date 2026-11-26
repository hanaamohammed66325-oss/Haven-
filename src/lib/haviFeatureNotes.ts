// Havi's message dismissals use the account's seen flags, under a version no
// release uses. Keep existing message IDs stable across devices and releases.

import { whatsNewPrefKey, type WhatsNewSeen } from "./whatsNew";

export type FeatureNoteId = "groups" | "referral";
export const FEATURE_NOTE_VERSION = 900;
export type HaviNoteId = FeatureNoteId | "gpa";
export const featureNoteSeenPage = (id: HaviNoteId) => `note-${id}`;

export function isHaviNoteDismissed(seen: WhatsNewSeen, id: HaviNoteId): boolean {
  return seen[whatsNewPrefKey(FEATURE_NOTE_VERSION, featureNoteSeenPage(id))] === true;
}
