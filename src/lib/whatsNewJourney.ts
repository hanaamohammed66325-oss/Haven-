import { hasSeenWhatsNew, whatsNewPrefKey, WHATS_NEW_VERSION, type WhatsNewSeen } from "./whatsNew";

export type WhatsNewPageId = "academics" | "planning" | "lake" | "grading" | "audio" | "referrals" | "groups";
export type WhatsNewPage = { id: WhatsNewPageId; kind: "text" | "referrals" | "groups"; items: readonly string[] };

/** Later acknowledged releases already included the earlier announcement bundles. */
export function whatsNewPages(seen: WhatsNewSeen): WhatsNewPage[] {
  if (hasSeenWhatsNew(seen)) return [];
  const latest = [3, 4, 5].filter(v => hasSeenWhatsNew(seen, v)).at(-1) ?? 0;
  const pages: WhatsNewPage[] = [];
  if (latest < 3) pages.push(
    { id: "academics", kind: "text", items: ["term", "abroad", "gpa"] },
    { id: "planning", kind: "text", items: ["pomodoro", "reminders"] },
  );
  if (latest < 4) pages.push({ id: "lake", kind: "text", items: ["lakemap", "scene", "tasks"] });
  if (latest < 5) pages.push({ id: "grading", kind: "text", items: ["curve"] });
  pages.push({ id: "audio", kind: "text", items: ["audioLibrary", "audioPersonal", "audioAlert"] },
    { id: "referrals", kind: "referrals", items: [] }, { id: "groups", kind: "groups", items: [] });
  return pages.filter(page => seen[whatsNewPrefKey(WHATS_NEW_VERSION, page.id)] !== true);
}
