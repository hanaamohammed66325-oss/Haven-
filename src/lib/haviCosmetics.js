/**
 * Cosmetics for Havi — ported from the ambassador design showcase.
 * Each cosmetic draws over the 28×21 Havi grid using `s` pixels per cell.
 *   back(ctx, s)  — optional layer drawn BEHIND the body (e.g. a cloak)
 *   front(ctx, s) — layer drawn ON TOP of the face (crown, glasses, scarf…)
 * Used by HaviMascot and the ambassador panel's showcase.
 */
const C = {
  k: "#111111", gold: "#d9a441", goldHi: "#f2d94e", navy: "#2b3245",
  red: "#c0563f", white: "#f7f5ee", b: "#3b6ea5", L: "#85b7eb",
  pink: "#e88bb5", y: "#f2d94e", leaf: "#6a9c5a",
};
function P(ctx, s, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); }

// ---- The King: ornate jewelled crown + royal velvet mantle ----
function kingCrown(ctx, s) {
  const G = "#e89a2c", GHI = "#f7c65a", GD = "#b06f1c", RED = "#d0392a", RHI = "#ef6a4a", PALE = "#f3d98a";
  P(ctx, s, 6, 5, 16, 2, G); P(ctx, s, 6, 5, 16, 1, GHI);
  P(ctx, s, 9, 5, 1, 1, RED); P(ctx, s, 18, 5, 1, 1, RED);
  [6, 8, 10, 12, 14, 16, 18, 20].forEach((x) => P(ctx, s, x, 7, 1, 1, G));
  [7, 11, 15, 19].forEach((x) => P(ctx, s, x, 7, 1, 1, PALE));
  P(ctx, s, 6, 3, 4, 2, G); P(ctx, s, 6, 3, 4, 1, GHI);
  P(ctx, s, 7, 1, 2, 2, G); P(ctx, s, 7, 1, 2, 1, GHI);
  P(ctx, s, 7, 3, 3, 1, GD); P(ctx, s, 8, 3, 1, 2, GD);
  P(ctx, s, 18, 3, 4, 2, G); P(ctx, s, 18, 3, 4, 1, GHI);
  P(ctx, s, 19, 1, 2, 2, G); P(ctx, s, 19, 1, 2, 1, GHI);
  P(ctx, s, 18, 3, 3, 1, GD); P(ctx, s, 19, 3, 1, 2, GD);
  P(ctx, s, 11, 3, 6, 2, G); P(ctx, s, 11, 3, 6, 1, GHI);
  P(ctx, s, 13, 3, 2, 2, RED); P(ctx, s, 13, 3, 1, 1, RHI);
  P(ctx, s, 13, 0, 2, 3, G); P(ctx, s, 13, 0, 2, 1, GHI); P(ctx, s, 13, 0, 1, 1, GHI);
}
function cloakBack(ctx, s) {
  const V = "#6a1f36", VH = "#8a2f4c", VD = "#3d1a2b";
  P(ctx, s, 1, 13, 26, 3, V); P(ctx, s, 1, 13, 26, 1, VH);
  P(ctx, s, 0, 15, 7, 6, V); P(ctx, s, 21, 15, 7, 6, V);
  P(ctx, s, 0, 20, 8, 1, VD); P(ctx, s, 20, 20, 8, 1, VD);
  P(ctx, s, 1, 15, 1, 6, VH); P(ctx, s, 26, 15, 1, 6, VD);
}
function cloakFront(ctx, s) {
  const V = "#6a1f36", VH = "#8a2f4c", VD = "#3d1a2b", GO = "#e0982e", GHI = "#f6c95a", W = "#ffffff", WSH = "#dcd7c9", K = "#111111";
  P(ctx, s, 2, 13, 5, 2, V); P(ctx, s, 21, 13, 5, 2, V); P(ctx, s, 2, 13, 5, 1, VH); P(ctx, s, 21, 13, 5, 1, VH);
  P(ctx, s, 2, 15, 4, 5, V); P(ctx, s, 2, 15, 4, 1, VH); P(ctx, s, 2, 19, 4, 1, VD);
  P(ctx, s, 22, 15, 4, 5, V); P(ctx, s, 22, 15, 4, 1, VH); P(ctx, s, 22, 19, 4, 1, VD);
  P(ctx, s, 4, 14, 20, 2, W); P(ctx, s, 4, 15, 20, 1, WSH);
  P(ctx, s, 6, 16, 2, 4, W); P(ctx, s, 20, 16, 2, 4, W); P(ctx, s, 6, 19, 2, 1, WSH); P(ctx, s, 20, 19, 2, 1, WSH);
  [6, 10, 14, 18, 22].forEach((x) => P(ctx, s, x, 14, 1, 1, K));
  P(ctx, s, 6, 17, 1, 1, K); P(ctx, s, 21, 17, 1, 1, K);
  P(ctx, s, 12, 14, 4, 2, GO); P(ctx, s, 12, 14, 4, 1, GHI); P(ctx, s, 13, 15, 2, 1, "#cf3a2b");
}

export const COSMETICS = {
  king: {
    label: "زي الملك (تاج وعباءة)",
    back: cloakBack,
    front(ctx, s) { cloakFront(ctx, s); kingCrown(ctx, s); },
  },
  crown: {
    label: "تاج",
    front(ctx, s) {
      P(ctx, s, 7, 5, 14, 1, C.gold);
      [8, 11, 14, 17, 20].forEach((x) => P(ctx, s, x, 3, 1, 2, C.goldHi));
      P(ctx, s, 7, 4, 14, 1, C.gold); P(ctx, s, 11, 4, 1, 1, C.pink); P(ctx, s, 17, 4, 1, 1, C.b);
    },
  },
  gradcap: {
    label: "قبعة التخرج",
    front(ctx, s) {
      P(ctx, s, 5, 3, 18, 1, C.navy); P(ctx, s, 7, 4, 14, 1, "#1b2130"); P(ctx, s, 13, 2, 2, 1, C.gold);
      P(ctx, s, 20, 4, 1, 3, C.goldHi); P(ctx, s, 20, 7, 1, 1, C.gold);
    },
  },
  glasses: {
    label: "نظارة",
    front(ctx, s) {
      P(ctx, s, 7, 9, 4, 1, C.k); P(ctx, s, 7, 11, 4, 1, C.k); P(ctx, s, 7, 9, 1, 3, C.k); P(ctx, s, 10, 9, 1, 3, C.k);
      P(ctx, s, 17, 9, 4, 1, C.k); P(ctx, s, 17, 11, 4, 1, C.k); P(ctx, s, 17, 9, 1, 3, C.k); P(ctx, s, 20, 9, 1, 3, C.k);
      P(ctx, s, 8, 10, 2, 1, C.L); P(ctx, s, 18, 10, 2, 1, C.L); P(ctx, s, 11, 10, 6, 1, C.k);
    },
  },
  beanie: {
    label: "قبعة شتوية",
    front(ctx, s) {
      P(ctx, s, 6, 5, 16, 2, C.red); P(ctx, s, 6, 4, 16, 1, "#a8472f"); P(ctx, s, 6, 7, 16, 1, "#d98a76"); P(ctx, s, 13, 2, 2, 2, C.white);
    },
  },
  flower: {
    label: "إكليل ورد",
    front(ctx, s) {
      for (let x = 6; x <= 20; x += 3) { P(ctx, s, x, 4, 1, 1, C.pink); P(ctx, s, x + 1, 4, 1, 1, C.y); P(ctx, s, x - 1, 5, 1, 1, C.leaf); P(ctx, s, x + 1, 5, 1, 1, C.leaf); }
      P(ctx, s, 6, 5, 16, 1, C.leaf);
    },
  },
  headphones: {
    label: "سماعات",
    front(ctx, s) {
      P(ctx, s, 6, 4, 16, 1, C.navy); P(ctx, s, 5, 4, 1, 2, C.navy); P(ctx, s, 22, 4, 1, 2, C.navy);
      P(ctx, s, 3, 8, 3, 4, C.navy); P(ctx, s, 22, 8, 3, 4, C.navy); P(ctx, s, 4, 9, 1, 2, C.b); P(ctx, s, 23, 9, 1, 2, C.b);
    },
  },
  scarf: {
    label: "وشاح",
    front(ctx, s) {
      P(ctx, s, 2, 14, 22, 2, C.b); P(ctx, s, 2, 14, 22, 1, C.L);
      P(ctx, s, 2, 14, 2, 2, "#2f588a"); P(ctx, s, 22, 14, 2, 2, "#2f588a");
      P(ctx, s, 12, 15, 4, 2, "#2f588a"); P(ctx, s, 13, 15, 2, 1, C.b);
      P(ctx, s, 11, 16, 2, 3, C.b); P(ctx, s, 11, 18, 2, 1, C.L);
      P(ctx, s, 15, 16, 2, 3, C.b); P(ctx, s, 15, 18, 2, 1, C.L);
    },
  },
  bowtie: {
    label: "ربطة عنق",
    front(ctx, s) {
      P(ctx, s, 10, 15, 3, 3, C.red); P(ctx, s, 15, 15, 3, 3, C.red);
      P(ctx, s, 10, 15, 3, 1, "#d97a68"); P(ctx, s, 15, 15, 3, 1, "#d97a68"); P(ctx, s, 13, 16, 2, 2, "#8f3a2c");
    },
  },
};

/**
 * Which body zones each cosmetic occupies. Two cosmetics can be worn together
 * ONLY if they share no zone — so glasses + scarf is fine (eyes vs neck) but
 * crown + beanie is not (both headTop), and scarf + bowtie is not (both neck).
 * "king" is the full royal set (crown + cloak) so it claims every zone and can't
 * be combined with anything.
 */
export const COSMETIC_ZONES = {
  king: ["headTop", "eyes", "neck"],
  crown: ["headTop"],
  gradcap: ["headTop"],
  beanie: ["headTop"],
  flower: ["headTop"],
  headphones: ["headTop"],
  glasses: ["eyes"],
  scarf: ["neck"],
  bowtie: ["neck"],
};

/** Do these two cosmetic ids overlap (share a body zone)? */
export function cosmeticsConflict(a, b) {
  if (a === b) return false;
  const za = COSMETIC_ZONES[a] || [];
  const zb = COSMETIC_ZONES[b] || [];
  return za.some((z) => zb.includes(z));
}

/** The subset of `equipped` that would clash with `id` (id itself excluded). */
export function conflictsWith(id, equipped) {
  return (equipped || []).filter((e) => cosmeticsConflict(id, e));
}

/**
 * Draw-order the equipped set so back layers (cloak) sit behind the body and
 * head pieces read correctly. Order within a layer doesn't matter (zones differ).
 */
export function orderedCosmetics(ids) {
  const set = (ids || []).filter((id) => id && id !== "none" && COSMETICS[id]);
  return COSMETIC_ORDER.filter((id) => set.includes(id));
}

export const COSMETIC_ORDER = ["none", "king", "crown", "gradcap", "glasses", "beanie", "flower", "headphones", "scarf", "bowtie"];
export const COSMETIC_LABELS = {
  none: "بدون",
  ...Object.fromEntries(Object.entries(COSMETICS).map(([k, v]) => [k, v.label])),
};
const COSMETIC_LABELS_EN = {
  none: "None", king: "The King", crown: "Crown", gradcap: "Graduation cap",
  glasses: "Glasses", beanie: "Beanie", flower: "Flower crown",
  headphones: "Headphones", scarf: "Scarf", bowtie: "Bow tie",
};
export function cosmeticLabel(id, lang) {
  return lang === "en" ? COSMETIC_LABELS_EN[id] || id : COSMETIC_LABELS[id] || id;
}
