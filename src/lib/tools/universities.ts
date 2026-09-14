// Curated list of major Saudi universities for the programmatic GPA pages
// (/tools/gpa-calculator/[university]). Each page targets the long-tail query
// "حاسبة معدل جامعة X" — far less competitive than the head term, so it can rank
// faster, and there are many of them (the scale lever for search reach).
//
// DATA HONESTY: `scale` is the GPA system that university is commonly known to
// use, and `denialPct` the usual حرمان threshold. These CAN differ by college or
// year, so every page shows a "verify with your own regulations" note and links
// to the official site. Public universities almost all use the 5.0 scale;
// KFUPM, Alfaisal and Effat use 4.0. حرمان is ~25% almost everywhere.

export interface University {
  slug: string; // ASCII slug used in the URL
  name: string; // full Arabic name
  scale: "5" | "4";
  denialPct: number; // typical حرمان threshold
  site?: string; // official website (for an outbound authority link)
}

export const UNIVERSITIES: University[] = [
  { slug: "king-saud", name: "جامعة الملك سعود", scale: "5", denialPct: 25, site: "https://ksu.edu.sa" },
  { slug: "king-abdulaziz", name: "جامعة الملك عبدالعزيز", scale: "5", denialPct: 25, site: "https://www.kau.edu.sa" },
  { slug: "imam", name: "جامعة الإمام محمد بن سعود الإسلامية", scale: "5", denialPct: 25, site: "https://imamu.edu.sa" },
  { slug: "princess-nourah", name: "جامعة الأميرة نورة بنت عبدالرحمن", scale: "5", denialPct: 25, site: "https://www.pnu.edu.sa" },
  { slug: "king-khalid", name: "جامعة الملك خالد", scale: "5", denialPct: 25, site: "https://www.kku.edu.sa" },
  { slug: "qassim", name: "جامعة القصيم", scale: "5", denialPct: 25, site: "https://www.qu.edu.sa" },
  { slug: "taibah", name: "جامعة طيبة", scale: "5", denialPct: 25, site: "https://www.taibahu.edu.sa" },
  { slug: "umm-alqura", name: "جامعة أم القرى", scale: "5", denialPct: 25, site: "https://uqu.edu.sa" },
  { slug: "king-faisal", name: "جامعة الملك فيصل", scale: "5", denialPct: 25, site: "https://www.kfu.edu.sa" },
  { slug: "jeddah", name: "جامعة جدة", scale: "5", denialPct: 25, site: "https://www.uj.edu.sa" },
  { slug: "taif", name: "جامعة الطائف", scale: "5", denialPct: 25, site: "https://www.tu.edu.sa" },
  { slug: "hail", name: "جامعة حائل", scale: "5", denialPct: 25, site: "https://www.uoh.edu.sa" },
  { slug: "tabuk", name: "جامعة تبوك", scale: "5", denialPct: 25, site: "https://www.ut.edu.sa" },
  { slug: "najran", name: "جامعة نجران", scale: "5", denialPct: 25, site: "https://www.nu.edu.sa" },
  { slug: "kfupm", name: "جامعة الملك فهد للبترول والمعادن", scale: "4", denialPct: 25, site: "https://www.kfupm.edu.sa" },
  { slug: "alfaisal", name: "جامعة الفيصل", scale: "4", denialPct: 25, site: "https://www.alfaisal.edu" },
  { slug: "effat", name: "جامعة عفت", scale: "4", denialPct: 25, site: "https://www.effatuniversity.edu.sa" },
];

export const universityBySlug = (slug: string): University | undefined =>
  UNIVERSITIES.find((u) => u.slug === slug);
