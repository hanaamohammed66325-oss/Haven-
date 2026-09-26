// Which country a student's university is in — worked out from the university
// they picked (every university in our list is Saudi) or, for one they typed
// themselves, from its name: a known university's name first, then a city,
// then the country's own name. There's no country picker: a name shared by
// universities in different countries offers them to choose from
// (universityChoices), and the one picked is saved with its country
// (lib/universityPick). A name we can't place returns null.

import { universityBySlug } from "./tools/universities";
import { CATALOG_UNIVERSITIES, joinParticles, matchCatalog } from "./gradeSchemes";
import { CATALOG_COUNTRY, pickedCountry, stripPick, withCountry } from "./universityPick";
import { publishedCalendars, universityCalendar } from "./countryHolidays";

/** Arabic letters folded so spelling variants match (أ/إ/آ→ا, ة→ه, ى→ي, no
 *  diacritics or tatweel); Latin lower-cased with accents dropped; a particle
 *  glued to the next word so spacing doesn't matter ("ابو ظبي" = "ابوظبي"). */
export function normalizeName(s: string): string {
  return joinParticles(foldName(stripPick(s)));
}

function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Checked in order: the first group that matches decides. Specific names come
// before cities and countries so "جامعة حمد بن خليفة" (Qatar) isn't read as
// Khalifa University (UAE), or "الأزهر بغزة" as al-Azhar in Cairo. Arabic
// terms are matched inside the name; Latin ones as whole words. Ambiguous
// words are left out on purpose: عمان (Oman or Amman), طرابلس (Libya or
// Lebanon), الزيتونة (Tunisia or Jordan).
const GROUPS: [string, string[]][][] = [
  // 1. universities whose name alone gives the country
  [
    ["TR", ["الشرق الاوسط التقنيه", "middle east technical"]],
    ["KW", ["الامريكيه في الشرق الاوسط", "american university of the middle east", "الخليج للعلوم والتكنولوجيا", "gulf university for science", "التعليم التطبيقي", "paaet"]],
    ["QA", ["حمد بن خليفه", "hamad bin khalifa", "hbku"]],
    ["PS", ["الازهر بغزه", "الازهر غزه", "al azhar university gaza", "بيرزيت", "birzeit", "النجاح", "najah", "القدس المفتوحه", "al quds open", "خضوري", "kadoorie"]],
    ["BH", ["الخليج العربي", "arabian gulf university"]],
    ["JO", ["الشرق الاوسط", "middle east university", "عمان الاهليه", "عمان العربيه", "الزيتونه الاردنيه", "اليرموك", "yarmouk", "مؤته", "mutah", "البلقاء", "balqa", "ال البيت", "al al bayt", "الهاشميه", "hashemite", "الحسين بن طلال", "الطفيله", "tafila", "الاميره سميه", "princess sumaya", "فيلادلفيا", "philadelphia university", "البترا", "petra university"]],
    ["OM", ["السلطان قابوس", "sultan qaboos", "squ", "نزوي", "nizwa", "ظفار", "dhofar", "صحار", "sohar", "سلطنه عمان"]],
    ["AE", ["خليفه", "khalifa university", "زايد", "zayed university", "كليات التقنيه العليا", "higher colleges of technology", "جامعه العين", "al ain university", "uaeu"]],
    ["EG", ["عين شمس", "ain shams", "الازهر", "al azhar", "azhar", "جنوب الوادي", "south valley", "قناه السويس", "suez canal"]],
    ["SD", ["النيلين", "neelain", "جامعه الجزيره", "university of gezira"]],
    ["IQ", ["المستنصريه", "mustansiriyah", "الجامعه التكنولوجيه", "university of technology iraq"]],
    ["MA", ["القاضي عياض", "cadi ayyad", "ابن طفيل", "ibn tofail", "الاخوين", "al akhawayn", "محمد الخامس", "mohammed v"]],
    ["DZ", ["باب الزوار", "usthb", "هواري بومدين"]],
    ["TN", ["المنار", "el manar", "منوبه", "manouba", "قرطاج", "carthage"]],
  ],
  // 2. cities
  [
    ["AE", ["دبي", "dubai", "ابوظبي", "ابو ظبي", "abu dhabi", "الشارقه", "sharjah", "عجمان", "ajman", "راس الخيمه", "ras al khaimah", "الفجيره", "fujairah", "ام القيوين", "umm al quwain"]],
    ["QA", ["الدوحه", "doha", "لوسيل", "lusail"]],
    ["BH", ["المنامه", "manama"]],
    ["OM", ["مسقط", "muscat"]],
    ["JO", ["اربد", "irbid", "الزرقاء", "zarqa", "amman"]],
    ["LB", ["بيروت", "beirut", "صيدا", "sidon", "جبيل", "byblos", "الكسليك", "kaslik"]],
    ["EG", ["القاهره", "cairo", "الاسكندريه", "alexandria", "المنصوره", "mansoura", "اسيوط", "assiut", "طنطا", "tanta", "الزقازيق", "zagazig", "حلوان", "helwan", "المنيا", "minia", "سوهاج", "sohag", "بنها", "benha", "المنوفيه", "menoufia", "كفر الشيخ", "kafrelsheikh", "الفيوم", "fayoum", "بني سويف", "beni suef", "بورسعيد", "port said", "دمياط", "damietta", "اسوان", "aswan", "دمنهور", "damanhour", "الجيزه", "giza"]],
    ["IQ", ["بغداد", "baghdad", "البصره", "basrah", "basra", "الموصل", "mosul", "اربيل", "erbil", "السليمانيه", "sulaimani", "كربلاء", "karbala", "النجف", "najaf", "الكوفه", "kufa", "بابل", "babylon", "ديالي", "diyala", "الانبار", "anbar", "تكريت", "tikrit", "كركوك", "kirkuk", "دهوك", "duhok"]],
    ["PS", ["غزه", "gaza", "الخليل", "hebron", "بيت لحم", "bethlehem", "نابلس", "nablus", "رام الله", "ramallah"]],
    ["SY", ["دمشق", "damascus", "حلب", "aleppo", "حمص", "homs", "اللاذقيه", "latakia", "تشرين", "tishreen"]],
    ["YE", ["صنعاء", "sanaa", "عدن", "aden", "تعز", "taiz", "حضرموت", "hadramout"]],
    ["SD", ["الخرطوم", "khartoum", "ام درمان", "omdurman"]],
    ["LY", ["بنغازي", "benghazi", "مصراته", "misurata", "سبها", "sebha"]],
    ["DZ", ["وهران", "oran", "قسنطينه", "constantine", "عنابه", "annaba", "سطيف", "setif", "تلمسان", "tlemcen", "بجايه", "bejaia", "باتنه", "batna", "البليده", "blida"]],
    ["MA", ["الرباط", "rabat", "الدار البيضاء", "casablanca", "فاس", "fes", "مراكش", "marrakech", "اكادير", "agadir", "طنجه", "tanger", "tangier", "مكناس", "meknes", "وجده", "oujda", "القنيطره", "kenitra"]],
    ["TN", ["صفاقس", "sfax", "سوسه", "sousse", "المنستير", "monastir", "قابس", "gabes", "قفصه", "gafsa", "القيروان", "kairouan", "جندوبه", "jendouba", "tunis"]],
    ["TR", ["اسطنبول", "istanbul", "انقره", "ankara", "ازمير", "izmir"]],
    ["MY", ["كوالالمبور", "kuala lumpur"]],
    ["GB", ["لندن", "london", "مانشستر", "manchester", "ليدز", "leeds", "برمنغهام", "birmingham", "ليفربول", "liverpool", "نوتنغهام", "nottingham", "شيفيلد", "sheffield", "غلاسكو", "glasgow", "ادنبره", "edinburgh", "اكسفورد", "oxford", "كامبريدج", "cambridge", "كارديف", "cardiff", "newcastle", "southampton", "leicester", "exeter", "sussex", "surrey", "kent", "bristol", "durham"]],
    ["US", ["نيويورك", "new york", "كاليفورنيا", "california", "تكساس", "texas", "فلوريدا", "florida", "بوسطن", "boston", "شيكاغو", "chicago", "ميشيغان", "michigan", "اوهايو", "ohio", "واشنطن", "washington", "state university", "arizona", "colorado", "oregon", "kansas", "missouri", "indiana", "illinois", "pennsylvania", "virginia", "carolina", "georgia", "tennessee", "kentucky", "oklahoma", "utah", "iowa", "wisconsin", "minnesota"]],
    ["CA", ["تورنتو", "toronto", "مونتريال", "montreal", "فانكوفر", "vancouver", "اوتاوا", "ottawa", "كالغاري", "calgary"]],
    ["AU", ["سيدني", "sydney", "ملبورن", "melbourne", "بريزبن", "brisbane", "بيرث", "perth", "اديلايد", "adelaide"]],
    ["IE", ["دبلن", "dublin"]],
    ["NZ", ["اوكلاند", "auckland"]],
  ],
  // 3. countries
  [
    ["SA", ["السعوديه", "saudi"]],
    ["AE", ["الامارات", "emirates", "uae"]],
    ["QA", ["قطر", "qatar"]],
    ["BH", ["البحرين", "bahrain"]],
    ["KW", ["الكويت", "kuwait"]],
    ["OM", ["oman"]],
    ["JO", ["الاردن", "الاردنيه", "jordan"]],
    ["LB", ["لبنان", "اللبنانيه", "lebanon", "lebanese"]],
    ["EG", ["مصر", "egypt", "misr"]],
    ["IQ", ["العراق", "iraq"]],
    ["PS", ["فلسطين", "palestine", "palestinian"]],
    ["SY", ["سوريا", "السوريه", "syria", "syrian"]],
    ["YE", ["اليمن", "yemen"]],
    ["SD", ["السودان", "sudan"]],
    ["LY", ["ليبيا", "الليبيه", "libya"]],
    ["DZ", ["الجزائر", "algeria", "algerie"]],
    ["MA", ["المغرب", "morocco", "maroc"]],
    ["TN", ["تونس", "tunisia", "tunisie"]],
    ["TR", ["تركيا", "turkey", "turkiye"]],
    ["MY", ["ماليزيا", "malaysia"]],
    ["GB", ["بريطانيا", "المملكه المتحده", "united kingdom", "england", "scotland", "wales"]],
    ["US", ["امريكا", "الولايات المتحده", "united states", "usa", "america"]],
    ["CA", ["كندا", "canada"]],
    ["AU", ["استراليا", "australia"]],
    ["IE", ["ايرلندا", "ireland"]],
    ["NZ", ["نيوزيلندا", "new zealand"]],
    ["DE", ["المانيا", "germany"]],
    ["FR", ["فرنسا", "france"]],
  ],
];

const LATIN = /^[a-z0-9 ]+$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MATCHERS: [string, ((n: string) => boolean)[]][][] = GROUPS.map((group) =>
  group.map(([code, terms]) => [
    code,
    terms.map((raw) => {
      const term = normalizeName(raw);
      if (LATIN.test(term)) {
        const re = new RegExp(`(^|\\s)${escape(term)}(\\s|$)`);
        return (n: string) => re.test(n);
      }
      return (n: string) => n.includes(term);
    }),
  ]),
);

const matchGroup = (group: [string, ((n: string) => boolean)[]][], n: string) =>
  group.find(([, tests]) => tests.some((test) => test(n)))?.[0] ?? null;

/** The country (ISO code) of a typed university name, or null: a specific
 *  name we know, then the university catalogue (421 universities, 40
 *  countries), then a city, then the country's own name. */
export function countryFromName(name: string): string | null {
  const picked = pickedCountry(name);
  if (picked) return picked;
  const n = normalizeName(name);
  if (!n) return null;
  // A name universities in several countries share: the one it names exactly,
  // when that's in one country only; otherwise it can't be told until picked.
  const same = sameNameUniversities(name);
  if (new Set(same.map((u) => u.country)).size > 1) {
    const exact = new Set(same.filter((u) => u.exact).map((u) => u.country));
    return exact.size === 1 ? [...exact][0] : null;
  }
  const [specific, ...rest] = MATCHERS;
  const known = matchGroup(specific, n);
  if (known) return known;
  const listed = matchCatalog(name);
  if (listed && CATALOG_COUNTRY[listed.country]) return CATALOG_COUNTRY[listed.country];
  for (const group of rest) {
    const code = matchGroup(group, n);
    if (code) return code;
  }
  return null;
}

// ── Universities that share a name ─────────────────────────────────────────

export interface UniversityChoice {
  ar: string;
  en: string;
  country: string;
  /** the typed name is this university's own name, word for word */
  exact: boolean;
}

// Universities missing from the catalogue whose name another country's
// university also has (University of Tripoli in Lebanon, Al-Zaytoonah in Jordan).
const SAME_NAME_EXTRA: { ar: string; en: string; country: string }[] = [
  { ar: "جامعة طرابلس", en: "University of Tripoli", country: "LY" },
  { ar: "جامعة الزيتونة", en: "Zitouna University", country: "TN" },
];

// "university", "college" and joining words: not what tells two names apart.
const KIND = new Set(["جامعه", "الجامعه", "كليه", "الكليه", "university", "college", "of", "the", "in", "at", "في", "al", "el"]);
const words = (s: string) => normalizeName(s.replace(/\(.*?\)/g, " ")).split(" ").filter(Boolean);
const core = (ws: string[]) => ws.filter((w) => !KIND.has(w));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((w) => b.includes(w));

let sameNameIndex: { ar: string; en: string; country: string; names: string[][] }[] | null = null;
function sameNameList() {
  sameNameIndex ??= [
    ...CATALOG_UNIVERSITIES.flatMap((u) => (CATALOG_COUNTRY[u.country] ? [{ ar: u.ar, en: u.en, country: CATALOG_COUNTRY[u.country] }] : [])),
    ...SAME_NAME_EXTRA,
  ].map((u) => ({ ...u, names: [words(u.ar), words(u.en)] }));
  return sameNameIndex;
}

/** Every university whose name holds all the distinctive words of the typed
 *  one ("جامعة الشرق الأوسط" → Middle East University in Jordan, Middle East
 *  College in Oman, …), marking the one it names exactly. */
function sameNameUniversities(name: string): UniversityChoice[] {
  const typed = words(stripPick(name));
  const want = core(typed);
  if (!want.length) return [];
  const out: UniversityChoice[] = [];
  for (const u of sameNameList()) {
    if (!u.names.some((n) => want.every((w) => core(n).includes(w)))) continue;
    if (out.some((o) => o.ar === u.ar && o.country === u.country)) continue;
    out.push({ ar: u.ar, en: u.en, country: u.country, exact: u.names.some((n) => sameSet(n, typed)) });
  }
  return out;
}

/** The universities to choose from when a typed name is shared by universities
 *  in different countries (the exact name first), or null when the name tells
 *  the country — or the student already picked it. */
export function universityChoices(name: string | null | undefined, max = 8): UniversityChoice[] | null {
  if (!name?.trim() || pickedCountry(name)) return null;
  const same = sameNameUniversities(name);
  if (new Set(same.map((u) => u.country)).size < 2) return null;
  return same.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, max);
}

/** The names suggested while a student types their university: every
 *  catalogue university in both languages, with its country when another
 *  country's university has the same name — so picking one needs no choice. */
export function typedUniversityNames(): string[] {
  return sameNameList().flatMap((u) => {
    const shared = (universityChoices(u.ar)?.length ?? 0) > 0;
    return shared ? [withCountry(u.ar, u.country, "ar"), withCountry(u.en, u.country, "en")] : [u.ar, u.en];
  });
}

// Universities of ours outside the catalogue, by name (see UNIVERSITY_HOLIDAYS).
const UNIVERSITY_TERMS: [string, string[]][] = [["ptuk", ["خضوري", "kadoorie", "palestine technical university"]]];

/** The university whose own calendar we hold that a typed name refers to, or
 *  null: one in the code (lib/countryHolidays UNIVERSITY_HOLIDAYS) first, then
 *  one the admin published — by its catalogue slug, or by the typed name. */
export function universityCalendarKey(name: string): string | null {
  const n = normalizeName(name);
  if (!n) return null;
  for (const [key, terms] of UNIVERSITY_TERMS) {
    if (terms.some((t) => n.includes(normalizeName(t)))) return key;
  }
  const slug = matchCatalog(name)?.slug;
  if (slug && universityCalendar(slug)) return slug;
  return publishedCalendars().find(([, c]) => c.names.includes(n))?.[0] ?? null;
}

/** What identifies a typed university when asking for its published calendar:
 *  the catalogue slug its name matches (if any) and the name, normalised. */
export function calendarLookup(name: string): { slug: string | null; name: string } {
  return { slug: matchCatalog(name)?.slug ?? null, name: normalizeName(name) };
}

/** The student's university's country: "SA" for a university from our list,
 *  the country a typed name points to, or null when it can't be told. */
export function universityCountry(academic?: { universitySlug?: string | null; universityName?: string | null } | null): string | null {
  const slug = academic?.universitySlug;
  if (slug && slug !== "other" && universityBySlug(slug)) return "SA";
  return countryFromName(academic?.universityName ?? "");
}

/** Whose holidays apply — the key lib/holidays resolves: "SA" for a Saudi
 *  university (the built-in rules, or its official calendar from the facts
 *  engine), the university's own calendar when we hold it, else its country's
 *  official holidays. A university we can't place keeps the Saudi calendar,
 *  as before (almost every student is at a Saudi one). */
export function holidayCalendar(academic?: { universitySlug?: string | null; universityName?: string | null } | null): string {
  const country = universityCountry(academic);
  if (country === "SA") return "SA";
  const slug = academic?.universitySlug;
  const typed = !slug || slug === "other" || !universityBySlug(slug);
  return (typed && universityCalendarKey(academic?.universityName ?? "")) || country || "SA";
}
