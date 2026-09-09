"use client";

import { useId } from "react";
import { MAX_TIER } from "@/lib/gamification";

// Heraldic achievement crest — a shield in the badge's own colour, framed in the
// tier metal (bronze → diamond), with a laurel wreath, a themed glyph, and tier
// pips. Pure inline SVG, no libraries. Tier is conveyed by the frame/laurel/pips,
// never by the shield colour, so the badges stay distinguishable.

interface Palette { light: string; mid: string; dark: string; ring: string; }

const TIER_METAL: (Palette & { pip: string })[] = [
  { light: "#dca070", mid: "#ad6636", dark: "#6d3d1b", ring: "#8c4f26", pip: "#7a4420" }, // bronze (copper)
  { light: "#f2f5f9", mid: "#c4cad3", dark: "#7f8895", ring: "#98a1ad", pip: "#7f8895" }, // silver
  { light: "#f6df94", mid: "#dbb851", dark: "#9a7614", ring: "#b8922f", pip: "#9a7614" }, // gold
  { light: "#ecfdfd", mid: "#a9e2e6", dark: "#3f8f97", ring: "#79c2c8", pip: "#3f8f97" }, // diamond
];

const BADGE_COLORS: Record<string, Palette> = {
  "first-checkin":       { light: "#6fa6b0", mid: "#477680", dark: "#294b53", ring: "#3a6068" },
  "safe":                { light: "#86c9a9", mid: "#5fa98c", dark: "#356a58", ring: "#4a8570" },
  "organized":           { light: "#6f9fd4", mid: "#3b6ea5", dark: "#264a6e", ring: "#315f8c" },
  "committed":           { light: "#e08bad", mid: "#c0567a", dark: "#853854", ring: "#a84868" },
  "outstanding-gpa":     { light: "#a595e0", mid: "#6f5bb5", dark: "#463877", ring: "#5c4a99" },
  "level-up":            { light: "#f2b876", mid: "#e08a3c", dark: "#9c5b1e", ring: "#c0742a" },
  "coursework-complete": { light: "#d98f6f", mid: "#c0563f", dark: "#853629", ring: "#a8482f" },
  "all-marks-complete":  { light: "#8f93e0", mid: "#5a5fbf", dark: "#393d80", ring: "#4a4d9e" },
  "perfect-score":       { light: "#e88a86", mid: "#d9534f", dark: "#943430", ring: "#b8423e" },
};
const DEFAULT_COLOR: Palette = { light: "#9fb0b2", mid: "#6b7a80", dark: "#3c474a", ring: "#556065" };

// themed glyphs drawn on a 24×24 grid, stroked in the badge's dark tone
const GLYPHS: Record<string, string> = {
  "first-checkin": `<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17"/><path d="M8 3v3M16 3v3"/><path d="M8.5 14.5l2.2 2.2 4.3-4.6"/>`,
  "safe": `<path d="M12 3.2l6.5 2.3v5.2c0 4.2-2.8 7.2-6.5 8.6-3.7-1.4-6.5-4.4-6.5-8.6V5.5L12 3.2z"/><path d="M8.7 12.2l2.3 2.3 4.4-4.7"/>`,
  "organized": `<rect x="5" y="4.5" width="14" height="16" rx="2"/><rect x="9" y="2.6" width="6" height="3.2" rx="1.2"/><path d="M8.4 10.2l1.5 1.5 2.6-2.8M8.4 15.2l1.5 1.5 2.6-2.8"/><path d="M13.6 10.2H16M13.6 15.2H16"/>`,
  "committed": `<circle cx="12" cy="9" r="5"/><path d="M9.6 13.4L8 21l4-2.3L16 21l-1.6-7.6"/><path d="M12 6.6l.9 1.8 2 .3-1.45 1.4.34 2L12 12.1l-1.79.9.34-2L9.1 9.7l2-.3.9-1.8z"/>`,
  "outstanding-gpa": `<path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.9l-4.7 2.46.9-5.23-3.8-3.7 5.25-.76L12 3.5z"/>`,
  "level-up": `<path d="M6 13.5l6-6 6 6"/><path d="M6 18.5l6-6 6 6"/>`,
  "coursework-complete": `<path d="M12 6.5C10 4.9 7 4.6 4.5 5.3v12.4C7 17 10 17.3 12 18.9c2-1.6 5-1.9 7.5-1.2V5.3C17 4.6 14 4.9 12 6.5z"/><path d="M12 6.5v12.4"/>`,
  "all-marks-complete": `<path d="M12 4L2.8 8.2 12 12.4l9.2-4.2L12 4z"/><path d="M6.5 10.2v4.1c0 1.4 2.6 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.1"/><path d="M21.2 8.2v4.4"/>`,
  "perfect-score": `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>`,
};

function leaf(cx: number, cy: number, rot: number, rx: number, ry: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/>`;
}
function laurel(side: number, col: string, filled: number): string {
  const pts: [number, number, number][] = [[36, 106, -78], [40, 94, -64], [42, 81, -49], [41, 68, -34], [37, 55, -19], [31, 44, -6]];
  let leaves = "";
  for (const [dx, y, ang] of pts) {
    leaves += leaf(60 + side * dx, y, side * ang, 7.6, 3.1);
    leaves += leaf(60 + side * (dx - 8), y + 3, side * (ang + 18), 5, 2.1);
  }
  leaves += `<circle cx="${60 + side * 30}" cy="114" r="2.2"/>`;
  return `<g fill="${col}" fill-opacity="${filled}" stroke="none">${leaves}</g>`;
}

export function BadgeCrest({ id, tier, size = 64 }: { id: string; tier: number; size?: number }) {
  const rawUid = useId();
  const uid = "bc" + rawUid.replace(/[^a-zA-Z0-9]/g, "");
  const tierIdx = Math.min(Math.max(tier, 1), MAX_TIER) - 1;
  const t = TIER_METAL[tierIdx];
  const bp = BADGE_COLORS[id] ?? DEFAULT_COLOR;
  const glyph = GLYPHS[id] ?? "";
  const tierNum = tierIdx + 1;
  const laurelOpacity = [0.28, 0.4, 0.55, 0.7][tierIdx];

  let pips = "";
  for (let i = 0; i < 4; i++) {
    const x = 60 + (i - 1.5) * 11;
    pips += `<circle cx="${x}" cy="132" r="3.4" fill="${i < tierNum ? t.pip : "none"}" stroke="${t.ring}" stroke-width="1.4"/>`;
  }
  const gem = tierNum === 4
    ? `<path d="M60 6 l6 6 -6 7 -6 -7z" fill="#fff" fill-opacity=".9" stroke="${t.ring}" stroke-width="1.3" stroke-linejoin="round"/>`
    : `<circle cx="60" cy="12.5" r="5.5" fill="${t.light}" stroke="${t.ring}" stroke-width="1.4"/>`;

  const inner = `
    <defs>
      <linearGradient id="${uid}m" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${bp.light}"/><stop offset="0.5" stop-color="${bp.mid}"/><stop offset="1" stop-color="${bp.dark}"/>
      </linearGradient>
      <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${laurel(-1, t.mid, laurelOpacity)}
    ${laurel(1, t.mid, laurelOpacity)}
    ${gem}
    <path d="M60 20 L94 30 V64 C94 92 78 108 60 118 C42 108 26 92 26 64 V30 Z" fill="url(#${uid}m)" stroke="${t.dark}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M60 20 L94 30 V64 C94 92 78 108 60 118 C42 108 26 92 26 64 V30 Z" fill="url(#${uid}s)"/>
    <path d="M60 24 L90.5 33 V64 C90.5 90 75.5 105 60 114 C44.5 105 29.5 90 29.5 64 V33 Z" fill="none" stroke="${t.mid}" stroke-width="2" stroke-opacity=".95"/>
    <path d="M60 29 L86 37 V63 C86 86 73 99 60 108 C47 99 34 86 34 63 V37 Z" fill="none" stroke="${bp.ring}" stroke-width="1.4" stroke-opacity=".85"/>
    <circle cx="60" cy="63" r="24" fill="#ffffff" fill-opacity=".6" stroke="${bp.ring}" stroke-width="1.2"/>
    <g transform="translate(60 63) scale(1.75) translate(-12 -12)" fill="none" stroke="${bp.dark}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    ${pips}
  `;

  return (
    <svg
      viewBox="0 0 120 145"
      width={size}
      height={Math.round((size * 145) / 120)}
      aria-hidden="true"
      style={{ display: "block" }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

// Tier indicator: the metal-shield crest with a star (bronze → diamond) — the
// exact "Tiers" design from the preview. Shown next to the tier label.
const STAR_GLYPH = `<path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.9l-4.7 2.46.9-5.23-3.8-3.7 5.25-.76L12 3.5z"/>`;

export function TierMedal({ tier, size = 28 }: { tier: number; size?: number }) {
  const rawUid = useId();
  const uid = "tm" + rawUid.replace(/[^a-zA-Z0-9]/g, "");
  const tierIdx = Math.min(Math.max(tier, 1), MAX_TIER) - 1;
  const t = TIER_METAL[tierIdx];
  const tierNum = tierIdx + 1;
  const laurelOpacity = [0.28, 0.4, 0.55, 0.7][tierIdx];

  let pips = "";
  for (let i = 0; i < 4; i++) {
    const x = 60 + (i - 1.5) * 11;
    pips += `<circle cx="${x}" cy="132" r="3.4" fill="${i < tierNum ? t.pip : "none"}" stroke="${t.ring}" stroke-width="1.4"/>`;
  }
  const gem = tierNum === 4
    ? `<path d="M60 6 l6 6 -6 7 -6 -7z" fill="#fff" fill-opacity=".9" stroke="${t.ring}" stroke-width="1.3" stroke-linejoin="round"/>`
    : `<circle cx="60" cy="12.5" r="5.5" fill="${t.light}" stroke="${t.ring}" stroke-width="1.4"/>`;

  const inner = `
    <defs>
      <linearGradient id="${uid}m" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.light}"/><stop offset="0.5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.dark}"/>
      </linearGradient>
      <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${laurel(-1, t.mid, laurelOpacity)}
    ${laurel(1, t.mid, laurelOpacity)}
    ${gem}
    <path d="M60 20 L94 30 V64 C94 92 78 108 60 118 C42 108 26 92 26 64 V30 Z" fill="url(#${uid}m)" stroke="${t.dark}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M60 20 L94 30 V64 C94 92 78 108 60 118 C42 108 26 92 26 64 V30 Z" fill="url(#${uid}s)"/>
    <path d="M60 29 L86 37 V63 C86 86 73 99 60 108 C47 99 34 86 34 63 V37 Z" fill="none" stroke="${t.ring}" stroke-width="1.4" stroke-opacity=".85"/>
    <circle cx="60" cy="63" r="24" fill="${t.light}" fill-opacity=".35" stroke="${t.ring}" stroke-width="1.2"/>
    <g transform="translate(60 63) scale(1.75) translate(-12 -12)" fill="none" stroke="${t.dark}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${STAR_GLYPH}</g>
    ${pips}
  `;
  return (
    <svg
      viewBox="0 0 120 145"
      width={size}
      height={Math.round((size * 145) / 120)}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
