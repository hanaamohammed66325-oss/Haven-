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
// حرمان is ~25% almost everywhere.
//
// COVERAGE: every Saudi government university plus the established private ones,
// so any student can pick theirs (with "أخرى" for the rest). The academic-profile
// selector auto-applies a picked university's denialPct + scale.
//
// BILINGUAL: `nameEn` gives the official English name so the selector localises
// and a hand-typed English name still resolves to the right grading scheme.

export interface University {
  slug: string; // ASCII slug used in the URL
  name: string; // full Arabic name
  nameEn: string; // official English name (selector display + English detection)
  scale: "5" | "4";
  denialPct: number; // typical حرمان threshold
  site?: string; // official website (for an outbound authority link)
  /** common short names / acronyms students might type by hand, so the academic
   *  profile can still detect the university from a free-typed name. */
  aliases?: string[];
}

export const UNIVERSITIES: University[] = [
  { slug: "king-saud", name: "جامعة الملك سعود", nameEn: "King Saud University", scale: "5", denialPct: 25, site: "https://ksu.edu.sa", aliases: ["ksu", "كي اس يو"] },
  { slug: "king-abdulaziz", name: "جامعة الملك عبدالعزيز", nameEn: "King Abdulaziz University", scale: "5", denialPct: 25, site: "https://www.kau.edu.sa", aliases: ["kau", "عبد العزيز"] },
  { slug: "imam", name: "جامعة الإمام محمد بن سعود الإسلامية", nameEn: "Imam Mohammad Ibn Saud Islamic University", scale: "5", denialPct: 25, site: "https://imamu.edu.sa", aliases: ["الامام", "امام محمد بن سعود", "imsiu"] },
  { slug: "princess-nourah", name: "جامعة الأميرة نورة بنت عبدالرحمن", nameEn: "Princess Nourah bint Abdulrahman University", scale: "5", denialPct: 25, site: "https://www.pnu.edu.sa", aliases: ["نورة", "نوره", "pnu"] },
  { slug: "king-khalid", name: "جامعة الملك خالد", nameEn: "King Khalid University", scale: "5", denialPct: 25, site: "https://www.kku.edu.sa", aliases: ["kku"] },
  { slug: "qassim", name: "جامعة القصيم", nameEn: "Qassim University", scale: "5", denialPct: 25, site: "https://www.qu.edu.sa" },
  { slug: "taibah", name: "جامعة طيبة", nameEn: "Taibah University", scale: "5", denialPct: 25, site: "https://www.taibahu.edu.sa" },
  { slug: "umm-alqura", name: "جامعة أم القرى", nameEn: "Umm Al-Qura University", scale: "5", denialPct: 25, site: "https://uqu.edu.sa", aliases: ["ام القرى", "uqu"] },
  { slug: "king-faisal", name: "جامعة الملك فيصل", nameEn: "King Faisal University", scale: "5", denialPct: 25, site: "https://www.kfu.edu.sa", aliases: ["kfu"] },
  { slug: "jeddah", name: "جامعة جدة", nameEn: "University of Jeddah", scale: "5", denialPct: 25, site: "https://www.uj.edu.sa" },
  { slug: "taif", name: "جامعة الطائف", nameEn: "Taif University", scale: "5", denialPct: 25, site: "https://www.tu.edu.sa" },
  { slug: "hail", name: "جامعة حائل", nameEn: "University of Ha'il", scale: "5", denialPct: 25, site: "https://www.uoh.edu.sa" },
  { slug: "tabuk", name: "جامعة تبوك", nameEn: "University of Tabuk", scale: "5", denialPct: 25, site: "https://www.ut.edu.sa" },
  { slug: "najran", name: "جامعة نجران", nameEn: "Najran University", scale: "5", denialPct: 25, site: "https://www.nu.edu.sa" },
  { slug: "jazan", name: "جامعة جازان", nameEn: "Jazan University", scale: "5", denialPct: 25, site: "https://www.jazanu.edu.sa" },
  { slug: "bisha", name: "جامعة بيشة", nameEn: "University of Bisha", scale: "5", denialPct: 25, site: "https://ub.edu.sa" },
  { slug: "jouf", name: "جامعة الجوف", nameEn: "Jouf University", scale: "5", denialPct: 25, site: "https://www.ju.edu.sa" },
  { slug: "northern-border", name: "جامعة الحدود الشمالية", nameEn: "Northern Border University", scale: "5", denialPct: 25, site: "https://www.nbu.edu.sa" },
  { slug: "bahah", name: "جامعة الباحة", nameEn: "Al-Baha University", scale: "5", denialPct: 25, site: "https://portal.bu.edu.sa" },
  { slug: "prince-sattam", name: "جامعة الأمير سطام بن عبدالعزيز", nameEn: "Prince Sattam bin Abdulaziz University", scale: "5", denialPct: 25, site: "https://www.psau.edu.sa" },
  { slug: "majmaah", name: "جامعة المجمعة", nameEn: "Majmaah University", scale: "5", denialPct: 25, site: "https://www.mu.edu.sa" },
  { slug: "shaqra", name: "جامعة شقراء", nameEn: "Shaqra University", scale: "5", denialPct: 25, site: "https://www.su.edu.sa" },
  { slug: "hafr-albatin", name: "جامعة حفر الباطن", nameEn: "University of Hafr Al-Batin", scale: "5", denialPct: 25, site: "https://www.uhb.edu.sa" },
  { slug: "imam-abdulrahman", name: "جامعة الإمام عبدالرحمن بن فيصل", nameEn: "Imam Abdulrahman Bin Faisal University", scale: "5", denialPct: 25, site: "https://www.iau.edu.sa", aliases: ["iau", "dammam"] },
  { slug: "saudi-electronic", name: "الجامعة السعودية الإلكترونية", nameEn: "Saudi Electronic University", scale: "5", denialPct: 25, site: "https://www.seu.edu.sa", aliases: ["seu"] },
  { slug: "ksau-hs", name: "جامعة الملك سعود للعلوم الصحية", nameEn: "King Saud bin Abdulaziz University for Health Sciences", scale: "5", denialPct: 25, site: "https://www.ksau-hs.edu.sa", aliases: ["ksau-hs", "ksau"] },
  { slug: "islamic-madinah", name: "الجامعة الإسلامية بالمدينة المنورة", nameEn: "Islamic University of Madinah", scale: "5", denialPct: 25, site: "https://iu.edu.sa" },
  { slug: "naif-security", name: "جامعة نايف العربية للعلوم الأمنية", nameEn: "Naif Arab University for Security Sciences", scale: "5", denialPct: 25, site: "https://www.nauss.edu.sa", aliases: ["nauss"] },
  { slug: "riyadh-arts", name: "جامعة الرياض للفنون", nameEn: "Riyadh University for Arts", scale: "5", denialPct: 25 },

  // 4.0-scale government / independent
  { slug: "kfupm", name: "جامعة الملك فهد للبترول والمعادن", nameEn: "King Fahd University of Petroleum and Minerals", scale: "4", denialPct: 25, site: "https://www.kfupm.edu.sa", aliases: ["كفوبم", "البترول والمعادن", "فهد للبترول", "kfupm"] },
  { slug: "kaust", name: "جامعة الملك عبدالله للعلوم والتقنية", nameEn: "King Abdullah University of Science and Technology", scale: "4", denialPct: 25, site: "https://www.kaust.edu.sa", aliases: ["كاوست", "عبدالله للعلوم", "kaust"] },

  // ── Private / أهلية universities ─────────────────────────────
  { slug: "alfaisal", name: "جامعة الفيصل", nameEn: "Alfaisal University", scale: "4", denialPct: 25, site: "https://www.alfaisal.edu", aliases: ["الفيصل", "alfaisal"] },
  { slug: "effat", name: "جامعة عفت", nameEn: "Effat University", scale: "4", denialPct: 25, site: "https://www.effatuniversity.edu.sa", aliases: ["عفت", "effat"] },
  { slug: "prince-sultan", name: "جامعة الأمير سلطان", nameEn: "Prince Sultan University", scale: "4", denialPct: 25, site: "https://www.psu.edu.sa", aliases: ["الامير سلطان", "psu"] },
  { slug: "prince-mohammad-fahd", name: "جامعة الأمير محمد بن فهد", nameEn: "Prince Mohammad Bin Fahd University", scale: "4", denialPct: 25, site: "https://www.pmu.edu.sa", aliases: ["محمد بن فهد", "pmu"] },
  { slug: "prince-fahd-sultan", name: "جامعة الأمير فهد بن سلطان", nameEn: "Prince Fahad bin Sultan University", scale: "4", denialPct: 25, site: "https://www.pfu.edu.sa", aliases: ["pfu"] },
  { slug: "prince-mugrin", name: "جامعة الأمير مقرن بن عبدالعزيز", nameEn: "Prince Mugrin University", scale: "4", denialPct: 25, site: "https://www.upm.edu.sa", aliases: ["upm"] },
  { slug: "dar-aluloom", name: "جامعة دار العلوم", nameEn: "Dar Al Uloom University", scale: "4", denialPct: 25, site: "https://www.dau.edu.sa" },
  { slug: "yamamah", name: "جامعة اليمامة", nameEn: "Al Yamamah University", scale: "4", denialPct: 25, site: "https://www.yu.edu.sa" },
  { slug: "dar-alhekma", name: "جامعة دار الحكمة", nameEn: "Dar Al-Hekma University", scale: "4", denialPct: 25, site: "https://www.dah.edu.sa" },
  { slug: "arab-open", name: "الجامعة العربية المفتوحة", nameEn: "Arab Open University", scale: "4", denialPct: 25, site: "https://arabou.edu.sa", aliases: ["aou"] },
  { slug: "ubt", name: "جامعة الأعمال والتكنولوجيا", nameEn: "University of Business and Technology", scale: "4", denialPct: 25, site: "https://www.ubt.edu.sa", aliases: ["ubt"] },
  { slug: "almaarefa", name: "جامعة المعرفة", nameEn: "Almaarefa University", scale: "5", denialPct: 25, site: "https://www.um.edu.sa" },
  { slug: "riyadh-elm", name: "جامعة رياض العلم", nameEn: "Riyadh Elm University", scale: "5", denialPct: 25, site: "https://www.riyadh.edu.sa" },
  { slug: "sulaiman-alrajhi", name: "جامعة سليمان الراجحي", nameEn: "Sulaiman Al Rajhi University", scale: "5", denialPct: 25, site: "https://sr.edu.sa" },
  { slug: "future-qassim", name: "جامعة المستقبل", nameEn: "Future University", scale: "5", denialPct: 25 },
];

export const universityBySlug = (slug: string): University | undefined =>
  UNIVERSITIES.find((u) => u.slug === slug);
