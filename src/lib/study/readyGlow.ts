import type { GroupSession } from "./session";

// A retained session keeps the readiness cue across scene/fullscreen remounts.
const cues = new WeakMap<GroupSession, { key: string; all: boolean; at: number }>();
export function readinessCue(session: GroupSession) {
  let cue = cues.get(session);
  if (!cue) { cue = { key: "", all: false, at: -Infinity }; cues.set(session, cue); }
  return cue;
}
