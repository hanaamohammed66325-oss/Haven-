import { breakEndAt, phaseAt, studyEndAt } from "@/lib/study/rules";
import type { StudyRound } from "@/lib/study/types";

/** Mount/reconnect establishes a baseline; only a recently observed boundary rings. */
export class RoundAudioAlerts {
  private roundId: string | null = null;
  private studyDone = false;
  private breakDone = false;
  observe(round: StudyRound | null, now: number): "study" | "break" | null {
    if (!round) { this.roundId = null; return null; }
    const phase = phaseAt(round, now);
    if (this.roundId !== round.id) {
      this.roundId = round.id;
      this.studyDone = phase === "break" || phase === "over" || phase === "cancelled";
      this.breakDone = phase === "over" || phase === "cancelled";
      return null;
    }
    if (phase === "cancelled") { this.studyDone = this.breakDone = true; return null; }
    if (phase === "scheduled" || phase === "paused" || phase === "study") return null;
    let alert: "study" | "break" | null = null;
    if (!this.studyDone) {
      this.studyDone = true;
      if (now - studyEndAt(round) <= 30_000) alert = "study";
    }
    if (phase === "over" && !this.breakDone) {
      this.breakDone = true;
      if (now - breakEndAt(round) <= 30_000) alert = "break";
    }
    return alert;
  }
}
