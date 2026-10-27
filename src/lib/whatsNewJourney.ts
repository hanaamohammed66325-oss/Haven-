import { hasSeenWhatsNew, whatsNewPrefKey, CURRENT_WHATS_NEW_VERSION, type WhatsNewSeen } from "./whatsNew";
import { GROUP_LAUNCH_STEPS } from "../../supabase/functions/_shared/groupLaunch";

export type WhatsNewPageId = "academics" | "planning" | "lake" | "grading" | "audio" | "referrals" | "groups" | typeof GROUP_LAUNCH_STEPS[number];
export type WhatsNewPage = { id: WhatsNewPageId; kind: "text" | "referrals" | "groups" | "launch"; items: readonly string[] };

/** Later acknowledged releases already included the earlier announcement bundles. */
export function whatsNewPages(seen: WhatsNewSeen, version: number = CURRENT_WHATS_NEW_VERSION): WhatsNewPage[] {
  if (hasSeenWhatsNew(seen, version)) return [];
  if (version === 7) return GROUP_LAUNCH_STEPS.map(id => ({ id, kind: "launch" as const, items: [] })).filter(page => seen[whatsNewPrefKey(version, page.id)] !== true);
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
  return pages.filter(page => seen[whatsNewPrefKey(version, page.id)] !== true);
}
