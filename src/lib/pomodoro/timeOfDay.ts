// Time-of-day detection and sky palettes for the Pomodoro pond scene.
// The pond's lighting follows the user's real clock so the environment feels
// alive: bright at midday, warm at sunset, dark and starry at night.

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

export interface SkyPalette {
  /** vertical gradient stops, top → bottom */
  top: string;
  bottom: string;
  /** water gradient, near → far */
  waterTop: string;
  waterBottom: string;
  /** celestial body colour + glow */
  celestial: string;
  celestialGlow: string;
  /** true = draw a moon + stars, false = draw a sun */
  night: boolean;
  /** hill tints (near, far) */
  hillNear: string;
  hillFar: string;
  /** the timer written into the sky: its ink, and the halo that lifts it off the sky */
  hudInk: string;
  hudGlow: string;
}

// Palettes lean into the cozy reference art: warm cream-and-sage days and a
// deep, soft sage-green night lit by a big golden moon (not a cold navy sky).
export const SKY_PALETTES: Record<TimeOfDay, SkyPalette> = {
  morning: {
    top: "#a3c7d0",
    bottom: "#d3ddce",
    waterTop: "#7fabbd",
    waterBottom: "#517f9c",
    celestial: "#e9dcb2",
    celestialGlow: "rgba(240,224,168,0.45)",
    night: false,
    hillNear: "#749f74",
    hillFar: "#94b892",
    hudInk: "#23443b",
    hudGlow: "rgba(255,252,240,0.7)",
  },
  afternoon: {
    top: "#92bcc6",
    bottom: "#c2d5c8",
    waterTop: "#71a2b8",
    waterBottom: "#457f9e",
    celestial: "#e7dbb4",
    celestialGlow: "rgba(238,226,184,0.42)",
    night: false,
    hillNear: "#639a68",
    hillFar: "#84b085",
    hudInk: "#1f4038",
    hudGlow: "rgba(255,252,240,0.66)",
  },
  evening: {
    top: "#f2a25a",
    bottom: "#8a6a7a",
    waterTop: "#9a7a86",
    waterBottom: "#3f3a52",
    celestial: "#ffd68f",
    celestialGlow: "rgba(255,178,110,0.5)",
    night: false,
    hillNear: "#5f5566",
    hillFar: "#7d6a72",
    hudInk: "#3a2231",
    hudGlow: "rgba(255,228,196,0.62)",
  },
  night: {
    top: "#243b2e",
    bottom: "#41604a",
    waterTop: "#2c4a44",
    waterBottom: "#132824",
    celestial: "#f4c74e",
    celestialGlow: "rgba(244,199,78,0.4)",
    night: true,
    hillNear: "#1a2e22",
    hillFar: "#24402f",
    hudInk: "#f8f0d8",
    hudGlow: "rgba(244,199,78,0.34)",
  },
};
