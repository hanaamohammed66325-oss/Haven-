// A typed university picked among several with the same name, by country:
// "كلية الشرق الأوسط (عُمان)". The country in brackets says which one it is
// (lib/universityCountry offers the choice when a name is shared across
// countries); everything that matches names reads the name without it.

/** The university catalogue's countries (lib/gradeCatalog) as ISO codes. */
export const CATALOG_COUNTRY: Record<string, string> = {
  "Saudi Arabia": "SA", "United Arab Emirates": "AE", Qatar: "QA", Bahrain: "BH", Kuwait: "KW", Oman: "OM",
  Jordan: "JO", Lebanon: "LB", Egypt: "EG", Iraq: "IQ", Syria: "SY", Palestine: "PS", Libya: "LY",
  Tunisia: "TN", Morocco: "MA", Somalia: "SO", "United States": "US", Canada: "CA", "United Kingdom": "GB",
  Australia: "AU", "New Zealand": "NZ", Germany: "DE", France: "FR", Denmark: "DK", Turkey: "TR",
  Malaysia: "MY", Indonesia: "ID", Thailand: "TH", India: "IN", Singapore: "SG", "Hong Kong": "HK",
  "South Korea": "KR", Japan: "JP", China: "CN", Taiwan: "TW", Brunei: "BN", Bangladesh: "BD",
  Georgia: "GE", Azerbaijan: "AZ", Armenia: "AM",
};

/** Country names as the student reads them next to a university. */
export const COUNTRY_LABEL: Record<string, { ar: string; en: string }> = {
  SA: { ar: "السعودية", en: "Saudi Arabia" },
  AE: { ar: "الإمارات", en: "UAE" },
  QA: { ar: "قطر", en: "Qatar" },
  BH: { ar: "البحرين", en: "Bahrain" },
  KW: { ar: "الكويت", en: "Kuwait" },
  OM: { ar: "عُمان", en: "Oman" },
  JO: { ar: "الأردن", en: "Jordan" },
  LB: { ar: "لبنان", en: "Lebanon" },
  EG: { ar: "مصر", en: "Egypt" },
  IQ: { ar: "العراق", en: "Iraq" },
  SY: { ar: "سوريا", en: "Syria" },
  PS: { ar: "فلسطين", en: "Palestine" },
  LY: { ar: "ليبيا", en: "Libya" },
  TN: { ar: "تونس", en: "Tunisia" },
  MA: { ar: "المغرب", en: "Morocco" },
  DZ: { ar: "الجزائر", en: "Algeria" },
  SD: { ar: "السودان", en: "Sudan" },
  YE: { ar: "اليمن", en: "Yemen" },
  SO: { ar: "الصومال", en: "Somalia" },
  US: { ar: "الولايات المتحدة", en: "United States" },
  CA: { ar: "كندا", en: "Canada" },
  GB: { ar: "المملكة المتحدة", en: "United Kingdom" },
  AU: { ar: "أستراليا", en: "Australia" },
  NZ: { ar: "نيوزيلندا", en: "New Zealand" },
  IE: { ar: "أيرلندا", en: "Ireland" },
  DE: { ar: "ألمانيا", en: "Germany" },
  FR: { ar: "فرنسا", en: "France" },
  DK: { ar: "الدنمارك", en: "Denmark" },
  TR: { ar: "تركيا", en: "Turkey" },
  MY: { ar: "ماليزيا", en: "Malaysia" },
  ID: { ar: "إندونيسيا", en: "Indonesia" },
  TH: { ar: "تايلاند", en: "Thailand" },
  IN: { ar: "الهند", en: "India" },
  SG: { ar: "سنغافورة", en: "Singapore" },
  HK: { ar: "هونغ كونغ", en: "Hong Kong" },
  KR: { ar: "كوريا الجنوبية", en: "South Korea" },
  JP: { ar: "اليابان", en: "Japan" },
  CN: { ar: "الصين", en: "China" },
  TW: { ar: "تايوان", en: "Taiwan" },
  BN: { ar: "بروناي", en: "Brunei" },
  BD: { ar: "بنغلاديش", en: "Bangladesh" },
  GE: { ar: "جورجيا", en: "Georgia" },
  AZ: { ar: "أذربيجان", en: "Azerbaijan" },
  AM: { ar: "أرمينيا", en: "Armenia" },
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const BY_LABEL = new Map<string, string>(
  Object.entries(COUNTRY_LABEL).flatMap(([code, l]) => [
    [fold(l.ar), code],
    [fold(l.en), code],
  ]),
);

const PICK = /\s*[(（]([^()（）]+)[)）]\s*$/;

/** The country a name was picked with ("… (عُمان)"), or null. */
export function pickedCountry(name: string | null | undefined): string | null {
  const m = PICK.exec(name ?? "");
  return m ? (BY_LABEL.get(fold(m[1])) ?? null) : null;
}

/** The name without the country it was picked with. */
export const stripPick = (name: string): string => (pickedCountry(name) ? name.replace(PICK, "") : name);

/** A university's name with its country, as saved when the student picks it. */
export const withCountry = (name: string, code: string, lang: "ar" | "en" = "ar"): string =>
  `${stripPick(name)} (${COUNTRY_LABEL[code]?.[lang] ?? code})`;
