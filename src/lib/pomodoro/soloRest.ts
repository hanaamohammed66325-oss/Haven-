import { drawSocialHavi, type DeskPose } from "@/lib/study/havi";

/** Same desk artwork and activities as group sessions, with a local break clock. */
export function soloRestPose(elapsed: number, reduced: boolean): { pose: DeskPose; since: number } {
  if (reduced) return { pose: "sleep", since: 2 };
  if (elapsed < 0) return {pose:"wake",since:Math.max(0,2.7+elapsed)};
  const time = Math.max(0, elapsed) % 62.7;
  if (time < 20) return { pose: "sleep", since: time };
  if (time < 22.7) return { pose: "wake", since: time - 20 };
  if (time < 42.7) return { pose: "phone", since: time - 22.7 };
  return { pose: "look", since: time - 42.7 };
}

export function drawSoloRest(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seconds: number, elapsed: number, reduced: boolean, furniture?: (ctx: CanvasRenderingContext2D, behind: boolean) => void, cosmetics: readonly string[] = []) {
  const { pose, since } = soloRestPose(elapsed, reduced);
  drawSocialHavi(ctx, x, y, scale, seconds, pose, since, "#a8d98a", reduced, -1, furniture, cosmetics);
}
