import type { TranslationKey } from "@/i18n/translations/en";

/** Owner-supplied CC0 recordings. Loaded only when selected. */
export const STUDY_TRACKS: readonly { id: string; title: TranslationKey; url: string; artist: string }[] = [
  { id: "vaporware", title: "audio_vaporware", url: "/audio/vaporware.mp3", artist: "" },
  { id: "rain", title: "audio_rain", url: "/audio/dark-rainy-night.ogg", artist: "" },
  { id: "snow", title: "audio_snow", url: "/audio/first-snow.mp3", artist: "" },
];

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const AUDIO_ACCEPT = ".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*";
export function audioFileProblem(file: { name: string; size: number }): "size" | "format" | null {
  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) return "size";
  return /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name) ? null : "format";
}
export interface AudioPreferences { selected: string | null; volume: number; loop: boolean; alerts: boolean }
export const DEFAULT_AUDIO_PREFS: AudioPreferences = { selected: null, volume: .45, loop: true, alerts: true };
export function parseAudioPreferences(value: unknown): AudioPreferences {
  const p = value && typeof value === "object" ? value as Partial<AudioPreferences> : {};
  return {
    selected: typeof p.selected === "string" ? p.selected : null,
    volume: typeof p.volume === "number" && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : .45,
    loop: typeof p.loop === "boolean" ? p.loop : true,
    alerts: typeof p.alerts === "boolean" ? p.alerts : true,
  };
}
