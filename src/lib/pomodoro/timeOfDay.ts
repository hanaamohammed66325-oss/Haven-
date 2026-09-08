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
}

export const SKY_PALETTES: Record<TimeOfDay, SkyPalette> = {
  morning: {
    top: "#8fc8f0",
    bottom: "#dff0ff",
    waterTop: "#bfe0f2",
    waterBottom: "#6fb0cf",
    celestial: "#fff4c2",
    celestialGlow: "rgba(255,240,180,0.55)",
    night: false,
    hillNear: "#7fb98a",
    hillFar: "#a7d4b0",
  },
  afternoon: {
    top: "#4a90d9",
    bottom: "#9fd0f5",
    waterTop: "#7fc0e0",
    waterBottom: "#3f88b0",
    celestial: "#fff8e0",
    celestialGlow: "rgba(255,248,210,0.5)",
    night: false,
    hillNear: "#6cae7c",
    hillFar: "#96c9a2",
  },
  evening: {
    top: "#f5834f",
    bottom: "#7a4a8c",
    waterTop: "#9a6aa0",
    waterBottom: "#3a3560",
    celestial: "#ffd9a0",
    celestialGlow: "rgba(255,180,120,0.5)",
    night: false,
    hillNear: "#5a4a6a",
    hillFar: "#7a5f7f",
  },
  night: {
    top: "#080e20",
    bottom: "#223660",
    waterTop: "#1c2f50",
    waterBottom: "#0c1730",
    celestial: "#eef2ff",
    celestialGlow: "rgba(180,200,255,0.35)",
    night: true,
    hillNear: "#12203a",
    hillFar: "#1c2f50",
  },
};

/** Linear-interpolate between two hex colours (#rrggbb). */
export function lerpColor(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${to2(r)}${to2(g)}${to2(bl)}`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function to2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

/** Blend two sky palettes for a smooth transition when the period changes. */
export function lerpPalette(a: SkyPalette, b: SkyPalette, t: number): SkyPalette {
  return {
    top: lerpColor(a.top, b.top, t),
    bottom: lerpColor(a.bottom, b.bottom, t),
    waterTop: lerpColor(a.waterTop, b.waterTop, t),
    waterBottom: lerpColor(a.waterBottom, b.waterBottom, t),
    celestial: lerpColor(a.celestial, b.celestial, t),
    celestialGlow: t < 0.5 ? a.celestialGlow : b.celestialGlow,
    night: t < 0.5 ? a.night : b.night,
    hillNear: lerpColor(a.hillNear, b.hillNear, t),
    hillFar: lerpColor(a.hillFar, b.hillFar, t),
  };
}
