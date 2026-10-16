"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { StudyAudioPlayer } from "@/lib/studyAudio/player";

export function useStudyAudio() {
  const [player] = useState(() => new StudyAudioPlayer());
  const state = useSyncExternalStore(player.subscribe, player.snapshot, player.snapshot);
  useEffect(() => {
    void player.load();
    // Starting/joining by keyboard also grants the alert its user gesture.
    document.addEventListener("pointerdown", player.arm, { capture: true });
    document.addEventListener("keydown", player.arm, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", player.arm, { capture: true });
      document.removeEventListener("keydown", player.arm, { capture: true });
      player.dispose();
    };
  }, [player]);
  return { player, state };
}
