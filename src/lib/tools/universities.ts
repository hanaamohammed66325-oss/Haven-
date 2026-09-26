// Curated list of major Saudi universities for the programmatic GPA pages
// (/tools/gpa-calculator/[university]). Each page targets the long-tail query
// "حاسبة معدل جامعة X" — far less competitive than the head term, so it can rank
// faster, and there are many of them (the scale lever for search reach).
//
// DATA HONESTY: `scale` is the GPA system that university is commonly known to
// use, and `denialPct` the usual حرمان threshold. These CAN differ by college or
// year, so every page shows a "verify with your own regulations" note and links
// to the official site. Public universities almost all use the 5.0 scale;
// KFUPM/KAUST and most private (أهلية) universities — Alfaisal, Effat, Prince
// Sultan, PMU, Yamamah, Dar Al-Hekma, Dar Al Uloom, UBT, Arab Open — use 4.0.
// `denialPct` is NOT used for any student's absence: that comes only from a
// verified rule (attendance_policies) or the student's own answer.
//
// COVERAGE: every Saudi government university plus the established private ones,
// so any student can pick theirs (with "أخرى" for the rest). The academic-profile
// selector auto-applies a picked university's scale.
//
// BILINGUAL: `nameEn` gives the official English name so the selector localises
// and a hand-typed English name still resolves to the right grading scheme.

export interface University {
  slug: string; // ASCII slug used in the URL
  /** حكومية (public) or أهلية (private). */
  sector: "public" | "private";
  /** a college (كلية/كليات) rather than a university — shown in the same lists. */
  kind?: "college";
  name: string; // full Arabic name
  nameEn: string; // official English name (selector display + English detection)
  /** GPA scale, when confirmed. Entries without one still appear in the app's
   *  selector (the app then defaults to 5.0) but get no public SEO page, so we
   *  never publish a scale we haven't checked. */
  scale?: "5" | "4";
  denialPct: number; // typical حرمان threshold
  site?: string; // official website (for an outbound authority link)
  /** common short names / acronyms students might type by hand, so the academic
   *  profile can still detect the university from a free-typed name. */
  aliases?: string[];
}

export const UNIVERSITIES: University[] = [
  { slug: "king-saud", sector: "public", name: "جامعة الملك سعود", nameEn: "King Saud University", scale: "5", denialPct: 25, site: "https://ksu.edu.sa", aliases: ["ksu", "كي اس يو"] },
  { slug: "king-abdulaziz", sector: "public", name: "جامعة الملك عبدالعزيز", nameEn: "King Abdulaziz University", scale: "5", denialPct: 25, site: "https://www.kau.edu.sa", aliases: ["kau", "عبد العزيز"] },
  { slug: "imam", sector: "public", name: "جامعة الإمام محمد بن سعود الإسلامية", nameEn: "Imam Mohammad Ibn Saud Islamic University", scale: "5", denialPct: 25, site: "https://imamu.edu.sa", aliases: ["الامام", "امام محمد بن سعود", "imsiu"] },
  { slug: "princess-nourah", sector: "public", name: "جامعة الأميرة نورة بنت عبدالرحمن", nameEn: "Princess Nourah bint Abdulrahman University", scale: "5", denialPct: 25, site: "https://www.pnu.edu.sa", aliases: ["نورة", "نوره", "pnu"] },
  { slug: "king-khalid", sector: "public", name: "جامعة الملك خالد", nameEn: "King Khalid University", scale: "5", denialPct: 25, site: "https://www.kku.edu.sa", aliases: ["kku"] },
  { slug: "qassim", sector: "public", name: "جامعة القصيم", nameEn: "Qassim University", scale: "5", denialPct: 25, site: "https://www.qu.edu.sa" },
  { slug: "taibah", sector: "public", name: "جامعة طيبة", nameEn: "Taibah University", scale: "5", denialPct: 25, site: "https://www.taibahu.edu.sa" },
  { slug: "umm-alqura", sector: "public", name: "جامعة أم القرى", nameEn: "Umm Al-Qura University", scale: "5", denialPct: 25, site: "https://uqu.edu.sa", aliases: ["ام القرى", "uqu"] },
  { slug: "king-faisal", sector: "public", name: "جامعة الملك فيصل", nameEn: "King Faisal University", scale: "5", denialPct: 25, site: "https://www.kfu.edu.sa", aliases: ["kfu"] },
  { slug: "jeddah", sector: "public", name: "جامعة جدة", nameEn: "University of Jeddah", scale: "5", denialPct: 25, site: "https://www.uj.edu.sa" },
  { slug: "taif", sector: "public", name: "جامعة الطائف", nameEn: "Taif University", scale: "5", denialPct: 25, site: "https://www.tu.edu.sa" },
  { slug: "hail", sector: "public", name: "جامعة حائل", nameEn: "University of Ha'il", scale: "5", denialPct: 25, site: "https://www.uoh.edu.sa" },
  { slug: "tabuk", sector: "public", name: "جامعة تبوك", nameEn: "University of Tabuk", scale: "5", denialPct: 25, site: "https://www.ut.edu.sa" },
  { slug: "najran", sector: "public", name: "جامعة نجران", nameEn: "Najran University", scale: "5", denialPct: 25, site: "https://www.nu.edu.sa" },
  { slug: "jazan", sector: "public", name: "جامعة جازان", nameEn: "Jazan University", scale: "5", denialPct: 25, site: "https://www.jazanu.edu.sa" },
  { slug: "bisha", sector: "public", name: "جامعة بيشة", nameEn: "University of Bisha", scale: "5", denialPct: 25, site: "https://ub.edu.sa" },
  { slug: "jouf", sector: "public", name: "جامعة الجوف", nameEn: "Jouf University", scale: "5", denialPct: 25, site: "https://www.ju.edu.sa" },
  { slug: "northern-border", sector: "public", name: "جامعة الحدود الشمالية", nameEn: "Northern Border University", scale: "5", denialPct: 25, site: "https://www.nbu.edu.sa" },
  { slug: "bahah", sector: "public", name: "جامعة الباحة", nameEn: "Al-Baha University", scale: "5", denialPct: 25, site: "https://portal.bu.edu.sa" },
  { slug: "prince-sattam", sector: "public", name: "جامعة الأمير سطام بن عبدالعزيز", nameEn: "Prince Sattam bin Abdulaziz University", scale: "5", denialPct: 25, site: "https://www.psau.edu.sa" },
  { slug: "majmaah", sector: "public", name: "جامعة المجمعة", nameEn: "Majmaah University", scale: "5", denialPct: 25, site: "https://www.mu.edu.sa" },
  { slug: "shaqra", sector: "public", name: "جامعة شقراء", nameEn: "Shaqra University", scale: "5", denialPct: 25, site: "https://www.su.edu.sa" },
  { slug: "hafr-albatin", sector: "public", name: "جامعة حفر الباطن", nameEn: "University of Hafr Al-Batin", scale: "5", denialPct: 25, site: "https://www.uhb.edu.sa" },
  { slug: "imam-abdulrahman", sector: "public", name: "جامعة الإمام عبدالرحمن بن فيصل", nameEn: "Imam Abdulrahman Bin Faisal University", scale: "5", denialPct: 25, site: "https://www.iau.edu.sa", aliases: ["iau", "dammam"] },
  { slug: "saudi-electronic", sector: "public", name: "الجامعة السعودية الإلكترونية", nameEn: "Saudi Electronic University", scale: "5", denialPct: 25, site: "https://www.seu.edu.sa", aliases: ["seu"] },
  { slug: "ksau-hs", sector: "public", name: "جامعة الملك سعود للعلوم الصحية", nameEn: "King Saud bin Abdulaziz University for Health Sciences", scale: "5", denialPct: 25, site: "https://www.ksau-hs.edu.sa", aliases: ["ksau-hs", "ksau"] },
  { slug: "islamic-madinah", sector: "public", name: "الجامعة الإسلامية بالمدينة المنورة", nameEn: "Islamic University of Madinah", scale: "5", denialPct: 25, site: "https://iu.edu.sa" },
  { slug: "naif-security", sector: "public", name: "جامعة نايف العربية للعلوم الأمنية", nameEn: "Naif Arab University for Security Sciences", scale: "5", denialPct: 25, site: "https://www.nauss.edu.sa", aliases: ["nauss"] },
  { slug: "riyadh-arts", sector: "public", name: "جامعة الرياض للفنون", nameEn: "Riyadh University for Arts", scale: "5", denialPct: 25 },

  // 4.0-scale government / independent
  { slug: "kfupm", sector: "public", name: "جامعة الملك فهد للبترول والمعادن", nameEn: "King Fahd University of Petroleum and Minerals", scale: "4", denialPct: 25, site: "https://www.kfupm.edu.sa", aliases: ["كفوبم", "البترول والمعادن", "فهد للبترول", "kfupm"] },
  { slug: "kaust", sector: "public", name: "جامعة الملك عبدالله للعلوم والتقنية", nameEn: "King Abdullah University of Science and Technology", scale: "4", denialPct: 25, site: "https://www.kaust.edu.sa", aliases: ["كاوست", "عبدالله للعلوم", "kaust"] },

  // ── Private / أهلية universities ─────────────────────────────
  { slug: "alfaisal", sector: "private", name: "جامعة الفيصل", nameEn: "Alfaisal University", scale: "4", denialPct: 25, site: "https://www.alfaisal.edu", aliases: ["الفيصل", "alfaisal"] },
  { slug: "effat", sector: "private", name: "جامعة عفت", nameEn: "Effat University", scale: "4", denialPct: 25, site: "https://www.effatuniversity.edu.sa", aliases: ["عفت", "effat"] },
  { slug: "prince-sultan", sector: "private", name: "جامعة الأمير سلطان", nameEn: "Prince Sultan University", scale: "4", denialPct: 25, site: "https://www.psu.edu.sa", aliases: ["الامير سلطان", "psu"] },
  { slug: "prince-mohammad-fahd", sector: "private", name: "جامعة الأمير محمد بن فهد", nameEn: "Prince Mohammad Bin Fahd University", scale: "4", denialPct: 25, site: "https://www.pmu.edu.sa", aliases: ["محمد بن فهد", "pmu"] },
  { slug: "prince-fahd-sultan", sector: "private", name: "جامعة الأمير فهد بن سلطان", nameEn: "Prince Fahad bin Sultan University", scale: "4", denialPct: 25, site: "https://www.pfu.edu.sa", aliases: ["pfu"] },
  { slug: "prince-mugrin", sector: "private", name: "جامعة الأمير مقرن بن عبدالعزيز", nameEn: "Prince Mugrin University", scale: "4", denialPct: 25, site: "https://www.upm.edu.sa", aliases: ["upm"] },
  { slug: "dar-aluloom", sector: "private", name: "جامعة دار العلوم", nameEn: "Dar Al Uloom University", scale: "4", denialPct: 25, site: "https://www.dau.edu.sa" },
  { slug: "yamamah", sector: "private", name: "جامعة اليمامة", nameEn: "Al Yamamah University", scale: "4", denialPct: 25, site: "https://www.yu.edu.sa" },
  { slug: "dar-alhekma", sector: "private", name: "جامعة دار الحكمة", nameEn: "Dar Al-Hekma University", scale: "4", denialPct: 25, site: "https://www.dah.edu.sa" },
  { slug: "arab-open", sector: "private", name: "الجامعة العربية المفتوحة", nameEn: "Arab Open University", scale: "4", denialPct: 25, site: "https://arabou.edu.sa", aliases: ["aou"] },
  { slug: "ubt", sector: "private", name: "جامعة الأعمال والتكنولوجيا", nameEn: "University of Business and Technology", scale: "4", denialPct: 25, site: "https://www.ubt.edu.sa", aliases: ["ubt"] },
  { slug: "almaarefa", sector: "private", name: "جامعة المعرفة", nameEn: "Almaarefa University", scale: "5", denialPct: 25, site: "https://www.um.edu.sa" },
  { slug: "riyadh-elm", sector: "private", name: "جامعة رياض العلم", nameEn: "Riyadh Elm University", scale: "5", denialPct: 25, site: "https://www.riyadh.edu.sa" },
  { slug: "sulaiman-alrajhi", sector: "private", name: "جامعة سليمان الراجحي", nameEn: "Sulaiman Al Rajhi University", scale: "5", denialPct: 25, site: "https://sr.edu.sa" },
  { slug: "future-qassim", sector: "private", name: "جامعة المستقبل", nameEn: "Future University", scale: "5", denialPct: 25 },
  // ── Added 2026-09-24 so every Saudi university and private college is
  // selectable and tracked in the admin facts page. Names cross-checked against
  // Arabic Wikipedia's list and Dirasa Abroad's list; scale/site left out until
  // confirmed (so no public page yet).
  { slug: "jubail-industrial", sector: "public", kind: "college", name: "كلية الجبيل الصناعية", nameEn: "Jubail Industrial College", denialPct: 25 },
  { slug: "yanbu-industrial", sector: "public", kind: "college", name: "كلية ينبع الصناعية", nameEn: "Yanbu Industrial College", denialPct: 25 },
  { slug: "jubail-university-college", sector: "public", kind: "college", name: "كلية الجبيل الجامعية", nameEn: "Jubail University College", denialPct: 25 },
  { slug: "yanbu-university-college", sector: "public", kind: "college", name: "كلية ينبع الجامعية", nameEn: "Yanbu University College", denialPct: 25 },
  { slug: "mbsc", sector: "private", kind: "college", name: "كلية الأمير محمد بن سلمان للإدارة وريادة الأعمال", nameEn: "Prince Mohammad Bin Salman College of Business & Entrepreneurship", denialPct: 25, aliases: ["mbsc"] },
  { slug: "ibn-sina", sector: "private", kind: "college", name: "كلية ابن سينا الأهلية للعلوم الطبية", nameEn: "Ibn Sina National College for Medical Studies", denialPct: 25, aliases: ["ابن سينا"] },
  { slug: "fakeeh", sector: "private", kind: "college", name: "كلية فقيه للعلوم الطبية", nameEn: "Fakeeh College for Medical Sciences", denialPct: 25, aliases: ["فقيه"] },
  { slug: "batterjee", sector: "private", kind: "college", name: "كلية البترجي الطبية", nameEn: "Batterjee Medical College", denialPct: 25, aliases: ["البترجي", "bmc"] },
  { slug: "vision-colleges", sector: "private", kind: "college", name: "كليات الرؤية", nameEn: "Vision Colleges", denialPct: 25 },
  { slug: "jeddah-international", sector: "private", kind: "college", name: "كلية جدة العالمية", nameEn: "Jeddah International College", denialPct: 25 },
  { slug: "alrayan", sector: "private", kind: "college", name: "كليات الريان الأهلية", nameEn: "Alrayan Colleges", denialPct: 25, aliases: ["الريان"] },
  { slug: "gulf-colleges", sector: "private", kind: "college", name: "كليات الخليج الأهلية", nameEn: "Gulf Colleges", denialPct: 25 },
  { slug: "asala", sector: "private", kind: "college", name: "كليات الأصالة الأهلية", nameEn: "Al-Asalah Colleges", denialPct: 25, aliases: ["الأصالة"] },
  { slug: "unaizah-colleges", sector: "private", kind: "college", name: "كليات عنيزة الأهلية", nameEn: "Unaizah Colleges", denialPct: 25 },
  { slug: "ibn-rushd", sector: "private", kind: "college", name: "كلية ابن رشد للعلوم الإدارية", nameEn: "Ibn Rushd College for Management Sciences", denialPct: 25 },
  { slug: "albaha-private", sector: "private", kind: "college", name: "كلية الباحة الأهلية للعلوم", nameEn: "Al-Baha Private College of Sciences", denialPct: 25 },
  { slug: "alriyada", sector: "private", kind: "college", name: "كلية الريادة للعلوم الصحية", nameEn: "Al-Riyada College for Health Sciences", denialPct: 25 },
  { slug: "arab-east", sector: "private", kind: "college", name: "كليات الشرق العربي للدراسات العليا", nameEn: "Arab East Colleges", denialPct: 25 },
  { slug: "inaya", sector: "private", kind: "college", name: "كلية العناية الطبية", nameEn: "Inaya Medical Colleges", denialPct: 25, aliases: ["العناية"] },
  { slug: "alghad", sector: "private", kind: "college", name: "كليات الغد الدولية للعلوم الطبية التطبيقية", nameEn: "Alghad International Colleges for Applied Medical Sciences", denialPct: 25, aliases: ["الغد"] },
  { slug: "buraydah-colleges", sector: "private", kind: "college", name: "كليات بريدة الأهلية", nameEn: "Buraydah Private Colleges", denialPct: 25 },
  { slug: "saad-college", sector: "private", kind: "college", name: "كلية سعد للتمريض والعلوم الصحية", nameEn: "Saad College of Nursing and Allied Health Sciences", denialPct: 25 },
  { slug: "almana", sector: "private", kind: "college", name: "كلية محمد المانع للعلوم الطبية", nameEn: "Mohammed Al-Mana College for Medical Sciences", denialPct: 25, aliases: ["المانع"] },
];

/** Entries with a confirmed GPA scale — the ones that get a public
 *  /tools/gpa-calculator/[university] page. */
export type SeoUniversity = University & { scale: "5" | "4" };
export const SEO_UNIVERSITIES = UNIVERSITIES.filter((u): u is SeoUniversity => !!u.scale);

export const universityBySlug = (slug: string): University | undefined =>
  UNIVERSITIES.find((u) => u.slug === slug);
