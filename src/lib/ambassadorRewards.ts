export const AMBASSADOR_BADGES: { id: string; ar: string; en: string; tier: string; legend?: boolean; svg: string }[] = [
  { id: "first", ar: "أول دعوة", en: "First invite", tier: "١", svg: `<svg viewBox="0 0 64 64"><defs><linearGradient id="am1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3d4"/><stop offset="1" stop-color="#2f7d8c"/></linearGradient></defs><rect x="9" y="19" width="46" height="30" rx="5" fill="url(#am1)" stroke="#1f5a66" stroke-width="1.6"/><path d="M11 22 L32 37 L53 22" fill="none" stroke="#eaf7fa" stroke-width="2.6" stroke-linejoin="round"/><path d="M50 9 l1.7 4.6 4.6 1.7 -4.6 1.7 -1.7 4.6 -1.7 -4.6 -4.6 -1.7 4.6 -1.7 z" fill="#ffe08a"/></svg>` },
  { id: "bronze", ar: "سفير برونزي", en: "Bronze ambassador", tier: "٢", svg: `<svg viewBox="0 0 64 64"><defs><linearGradient id="am2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6a86e"/><stop offset="1" stop-color="#8a4f22"/></linearGradient></defs><path d="M32 6 L54 14 V32 C54 45 44 54 32 58 C20 54 10 45 10 32 V14 Z" fill="url(#am2)" stroke="#6e3d18" stroke-width="2"/><text x="32" y="41" text-anchor="middle" font-family="Rubik,sans-serif" font-weight="700" font-size="26" fill="#fff3e6">2</text></svg>` },
  { id: "silver", ar: "سفير فضّي", en: "Silver ambassador", tier: "٦", svg: `<svg viewBox="0 0 64 64"><defs><linearGradient id="am3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fa"/><stop offset="1" stop-color="#94a2ae"/></linearGradient></defs><polygon points="32,10 37.3,24.7 52.9,25.2 40.6,34.8 44.9,49.8 32,41 19.1,49.8 23.4,34.8 11.1,25.2 26.7,24.7" fill="url(#am3)" stroke="#7c8894" stroke-width="1.8" stroke-linejoin="round"/><polygon points="32,20 34.5,29 43,29 36,34.5 38.5,43 32,37.5 25.5,43 28,34.5 21,29 29.5,29" fill="#fff" opacity=".55"/></svg>` },
  { id: "gold", ar: "سفير ذهبي", en: "Gold ambassador", tier: "٨", svg: `<svg viewBox="0 0 64 64"><defs><linearGradient id="am4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d873"/><stop offset="1" stop-color="#b8871f"/></linearGradient></defs><path d="M10 46 L15 22 L24 35 L32 16 L40 35 L49 22 L54 46 Z" fill="url(#am4)" stroke="#8a641a" stroke-width="1.8" stroke-linejoin="round"/><rect x="11" y="46" width="42" height="8" rx="2.5" fill="#c79226" stroke="#8a641a" stroke-width="1.4"/><circle cx="32" cy="20" r="2.6" fill="#fff2c2"/><circle cx="15.5" cy="24" r="2.2" fill="#fff2c2"/><circle cx="48.5" cy="24" r="2.2" fill="#fff2c2"/></svg>` },
  { id: "diamond", ar: "سفير Haven ألماسي", en: "Diamond ambassador", tier: "١٠", legend: true, svg: `<svg viewBox="0 0 64 64"><defs><linearGradient id="am5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3f4fb"/><stop offset="1" stop-color="#4bb4d6"/></linearGradient></defs><polygon points="16,26 32,11 48,26 32,55" fill="url(#am5)" stroke="#2f8fb0" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 26 H48 M24 18 L32 55 M40 18 L32 55 M24 18 L32 26 L40 18" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".7"/><path d="M52 12 l1.4 3.8 3.8 1.4 -3.8 1.4 -1.4 3.8 -1.4 -3.8 -3.8 -1.4 3.8 -1.4 z" fill="#eafaff"/></svg>` },
];

export type AmbassadorRung = {
  count: number;
  ar: string;
  en: string;
  outfits: string[];
  badge?: string;
  xp?: number;
  theme?: { id: "aurora" | "coral" | "ambassador"; ar: string; en: string };
  companion?: { id: "fox" | "tiger"; ar: string; en: string };
};

// Local reward mapping; displaying a preview never grants account rewards.
export const AMBASSADOR_RUNGS: AmbassadorRung[] = [
  { count: 1, ar: "أول دعوة", en: "First invite", outfits: ["beanie"], badge: "first", xp: 50 },
  { count: 2, ar: "السفير البرونزي", en: "Bronze ambassador", outfits: ["glasses", "bowtie"], badge: "bronze", xp: 100 },
  { count: 4, ar: "بلور", en: "Crystal", outfits: ["headphones"], theme: { id: "aurora", ar: "بلور", en: "Crystal" }, xp: 150 },
  { count: 6, ar: "السفير الفضي", en: "Silver ambassador", outfits: ["scarf", "flower"], badge: "silver", companion: { id: "fox", ar: "الثعلب", en: "Fox" } },
  { count: 8, ar: "السفير الذهبي", en: "Gold ambassador", outfits: ["crown", "gradcap"], badge: "gold", theme: { id: "coral", ar: "غسق", en: "Dusk" }, xp: 300 },
  { count: 10, ar: "سفير Haven الألماسي", en: "Haven diamond ambassador", outfits: ["king"], badge: "diamond", theme: { id: "ambassador", ar: "كهرمان", en: "Amber" }, companion: { id: "tiger", ar: "النمر", en: "Tiger" } },
];
