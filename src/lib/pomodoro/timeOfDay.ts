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
