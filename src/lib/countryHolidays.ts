// Official holidays for universities OUTSIDE Saudi Arabia, by country — the
// suggestion a student gets when their university's name places it in one of
// these countries (see lib/universityCountry). Saudi universities keep the
// built-in rules in lib/holidays.
//
// What goes here: only the country's public holidays (every university there
// observes them by law), plus an in-term break the ministry sets for all
// universities. A break one university sets for itself is left for the
// student to add. Each list is copied from an official calendar published for
// the year — never worked out or guessed:
//   AE  MoHESR 2026-2029 higher-education calendar (spring break); u.ae
//       public holidays; University of Sharjah 2026/2027 calendar (dates).
//   QA  Qatar University 2026/2027 academic calendar.
//   BH  University of Bahrain 2026-2027 academic calendar.
//   KW  Australian University (Kuwait) 2026-2027 calendar (Kuwait University
//       hasn't published 2026-2027 yet).
//   OM  Sultan Qaboos University 2026/2027 calendar (it marks the first day
//       of each Eid only).
//   JO  Yarmouk University 2026/2027 calendar (rows marked عطلة).
//   LB  American University of Beirut 2026-2027 calendar (national holidays
//       only, not its own breaks).
//   EG  American University in Cairo 2026-2027 calendar (Egypt's public
//       holidays only, not the university's own).
//   TN  Ministry of Higher Education 2026-2027 university calendar (Eid
//       dates to be announced — not listed yet).
//   MA  Ministry of Higher Education 2026/2027 university holidays table (as
//       posted by Faculté des Lettres Ben M'sik, Université Hassan II).
//   DZ  The legal list of public holidays (law 63-278 as amended by law
//       23-10), as published by Algérie Clearing.
//   PS  Palestine Technical University – Kadoorie (a public university)
//       2026-2027 calendar — the public holidays only, not its Women's Day
//       closure. Al-Zaytoonah (Salfit) agrees on those it has published so
//       far, except that it teaches on Isra and Mi'raj.
//   IQ  Official Holidays Law No. 12 of 2024 (Iraqi Gazette 4777, 27 May
//       2024), the general holidays only (not those of one faith). The Eids
//       run from the first day either endowment office declares to the last
//       day the other does, so each spans Umm al-Qura and a day after.
//   SY  Presidential Decree No. 188 of 2025 (SANA, 5 Oct 2025). The Eids and
//       Hijri days are announced each year; Umm al-Qura dates until then.
//   LY  Law No. 5 of 2012 on official holidays; the Prophet's Birthday 2026
//       from Prime Minister's decision No. 404 of 2026 (both via the Libyan
//       legal archive lawsociety.ly).
//   TR  Diyanet: 2026 and 2027 official holidays (law 2429) and religious
//       days. The half days before the Bayrams and on 28 October are left out
//       (the morning is taught).
//   DE  Federal Ministry of the Interior: the nine holidays every state's law
//       protects (each state adds its own).
//   FR  Service-Public (Premier ministre): fêtes légales 2026 and 2027, the
//       general list (not Alsace-Moselle's or overseas extras).
//   IE  Citizens Information (state body): public holidays 2026 and 2027.
//   NZ  Employment New Zealand: public holidays 2026 and 2027 on their
//       observed (Mondayised) dates; regional anniversary days left out.
// Not listed, on purpose: countries where each university decides which
// public holidays it closes on (US, UK, Canada, Australia, Japan…) — a
// country list would change the absence % wrongly; those students add their
// own. Yemen and Sudan: no official text of the full list found. Malaysia:
// the Cabinet's 2027 table (kabinet.gov.my) couldn't be reached.
// Moon-based dates are `estimated`: they move with the official sighting.

export interface CountryHoliday {
  id: string;
  nameAr: string;
  nameEn: string;
  /** ISO dates, inclusive */
  start: string;
  end: string;
  /** follows the moon sighting (or a yearly decree), so it may move a day or two */
  estimated?: boolean;
}

export const COUNTRY_NAMES: Record<string, { ar: string; en: string }> = {
  SA: { ar: "السعودية", en: "Saudi Arabia" },
  AE: { ar: "الإمارات", en: "the UAE" },
  QA: { ar: "قطر", en: "Qatar" },
  BH: { ar: "البحرين", en: "Bahrain" },
  KW: { ar: "الكويت", en: "Kuwait" },
  OM: { ar: "عُمان", en: "Oman" },
  JO: { ar: "الأردن", en: "Jordan" },
  LB: { ar: "لبنان", en: "Lebanon" },
  EG: { ar: "مصر", en: "Egypt" },
  TN: { ar: "تونس", en: "Tunisia" },
  IQ: { ar: "العراق", en: "Iraq" },
  PS: { ar: "فلسطين", en: "Palestine" },
  SY: { ar: "سوريا", en: "Syria" },
  YE: { ar: "اليمن", en: "Yemen" },
  SD: { ar: "السودان", en: "Sudan" },
  LY: { ar: "ليبيا", en: "Libya" },
  DZ: { ar: "الجزائر", en: "Algeria" },
  MA: { ar: "المغرب", en: "Morocco" },
  TR: { ar: "تركيا", en: "Turkey" },
  DE: { ar: "ألمانيا", en: "Germany" },
  FR: { ar: "فرنسا", en: "France" },
  IE: { ar: "أيرلندا", en: "Ireland" },
  NZ: { ar: "نيوزيلندا", en: "New Zealand" },
};

const eidFitr = (id: string, start: string, end: string): CountryHoliday => ({
  id, nameAr: "إجازة عيد الفطر", nameEn: "Eid al-Fitr break", start, end, estimated: true,
});
const eidAdha = (id: string, start: string, end: string): CountryHoliday => ({
  id, nameAr: "إجازة عيد الأضحى", nameEn: "Eid al-Adha break", start, end, estimated: true,
});
const hijriNewYear = (id: string, day: string): CountryHoliday => ({
  id, nameAr: "رأس السنة الهجرية", nameEn: "Islamic New Year", start: day, end: day, estimated: true,
});
const mawlid = (id: string, day: string): CountryHoliday => ({
  id, nameAr: "المولد النبوي", nameEn: "Prophet's Birthday", start: day, end: day, estimated: true,
});
const newYear = (id: string, day: string): CountryHoliday => ({
  id, nameAr: "رأس السنة الميلادية", nameEn: "New Year's Day", start: day, end: day,
});
const labourDay = (id: string, day: string): CountryHoliday => ({
  id, nameAr: "عيد العمال", nameEn: "Labour Day", start: day, end: day,
});

/** 2026-2027 academic year (Aug 2026 – Aug 2027). */
export const COUNTRY_HOLIDAYS: Record<string, CountryHoliday[]> = {
  AE: [
    mawlid("ae-mawlid-2026", "2026-08-25"),
    { id: "ae-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
    newYear("ae-new-year-2027", "2027-01-01"),
    eidFitr("ae-eid-fitr-2027", "2027-03-08", "2027-03-11"),
    { id: "ae-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-05", end: "2027-04-09" },
    eidAdha("ae-eid-adha-2027", "2027-05-15", "2027-05-19"),
    hijriNewYear("ae-hijri-2027", "2027-06-06"),
  ],
  QA: [
    { id: "qa-national-day-2026", nameAr: "اليوم الوطني", nameEn: "Qatar National Day", start: "2026-12-18", end: "2026-12-18" },
    { id: "qa-sport-day-2027", nameAr: "اليوم الرياضي للدولة", nameEn: "National Sport Day", start: "2027-02-09", end: "2027-02-09" },
    eidFitr("qa-eid-fitr-2027", "2027-03-07", "2027-03-13"),
    eidAdha("qa-eid-adha-2027", "2027-05-15", "2027-05-20"),
  ],
  BH: [
    { id: "bh-national-day-2026", nameAr: "العيد الوطني", nameEn: "National Day", start: "2026-12-16", end: "2026-12-17" },
    newYear("bh-new-year-2027", "2027-01-01"),
    eidFitr("bh-eid-fitr-2027", "2027-03-09", "2027-03-11"),
    labourDay("bh-labour-day-2027", "2027-05-01"),
    eidAdha("bh-eid-adha-2027", "2027-05-15", "2027-05-18"),
    hijriNewYear("bh-hijri-2027", "2027-06-06"),
    { id: "bh-ashura-2027", nameAr: "عاشوراء", nameEn: "Ashura", start: "2027-06-15", end: "2027-06-16", estimated: true },
  ],
  KW: [
    mawlid("kw-mawlid-2026", "2026-08-26"),
    newYear("kw-new-year-2027", "2027-01-01"),
    { id: "kw-isra-2027", nameAr: "الإسراء والمعراج", nameEn: "Isra and Mi'raj", start: "2027-01-06", end: "2027-01-06", estimated: true },
    { id: "kw-national-days-2027", nameAr: "العيد الوطني وعيد التحرير", nameEn: "National and Liberation Day", start: "2027-02-25", end: "2027-02-26" },
    eidFitr("kw-eid-fitr-2027", "2027-03-10", "2027-03-12"),
    eidAdha("kw-eid-adha-2027", "2027-05-16", "2027-05-19"),
    hijriNewYear("kw-hijri-2027", "2027-06-06"),
  ],
  OM: [
    { id: "om-national-day-2026", nameAr: "العيد الوطني", nameEn: "National Day", start: "2026-11-18", end: "2026-11-18" },
    { id: "om-isra-2027", nameAr: "الإسراء والمعراج", nameEn: "Isra and Mi'raj", start: "2027-01-05", end: "2027-01-05", estimated: true },
    { id: "om-accession-2027", nameAr: "ذكرى تولي السلطان مقاليد الحكم", nameEn: "Sultan's Accession Day", start: "2027-01-11", end: "2027-01-11" },
    eidFitr("om-eid-fitr-2027", "2027-03-09", "2027-03-09"),
    eidAdha("om-eid-adha-2027", "2027-05-16", "2027-05-16"),
    hijriNewYear("om-hijri-2027", "2027-06-06"),
  ],
  JO: [
    { id: "jo-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas", start: "2026-12-25", end: "2026-12-25" },
    newYear("jo-new-year-2027", "2027-01-01"),
    eidFitr("jo-eid-fitr-2027", "2027-03-10", "2027-03-12"),
    labourDay("jo-labour-day-2027", "2027-05-01"),
    eidAdha("jo-eid-adha-2027", "2027-05-17", "2027-05-20"),
    { id: "jo-independence-2027", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2027-05-25", end: "2027-05-25" },
    hijriNewYear("jo-hijri-2027", "2027-06-06"),
  ],
  LB: [
    { id: "lb-assumption-2026", nameAr: "عيد انتقال السيدة العذراء", nameEn: "Assumption Day", start: "2026-08-15", end: "2026-08-15" },
    mawlid("lb-mawlid-2026", "2026-08-25"),
    { id: "lb-independence-2026", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2026-11-22", end: "2026-11-22" },
    { id: "lb-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas", start: "2026-12-25", end: "2026-12-25" },
    newYear("lb-new-year-2027", "2027-01-01"),
    { id: "lb-armenian-christmas-2027", nameAr: "عيد الميلاد عند الأرمن", nameEn: "Armenian Christmas", start: "2027-01-06", end: "2027-01-06" },
    { id: "lb-st-maroun-2027", nameAr: "عيد مار مارون", nameEn: "St. Maroun's Day", start: "2027-02-09", end: "2027-02-09" },
    eidFitr("lb-eid-fitr-2027", "2027-03-10", "2027-03-12"),
    { id: "lb-annunciation-2027", nameAr: "عيد البشارة", nameEn: "Annunciation Day", start: "2027-03-25", end: "2027-03-25" },
    { id: "lb-easter-2027", nameAr: "عيد الفصح (الغربي)", nameEn: "Easter (Western)", start: "2027-03-26", end: "2027-03-29" },
    { id: "lb-orthodox-easter-2027", nameAr: "عيد الفصح (الشرقي) وعيد العمال", nameEn: "Easter (Eastern) and Labour Day", start: "2027-04-30", end: "2027-05-03" },
    eidAdha("lb-eid-adha-2027", "2027-05-17", "2027-05-19"),
    hijriNewYear("lb-hijri-2027", "2027-06-06"),
    { id: "lb-ashura-2027", nameAr: "عاشوراء", nameEn: "Ashura", start: "2027-06-15", end: "2027-06-15", estimated: true },
  ],
  EG: [
    mawlid("eg-mawlid-2026", "2026-08-27"),
    { id: "eg-armed-forces-2026", nameAr: "عيد القوات المسلحة", nameEn: "Armed Forces Day", start: "2026-10-08", end: "2026-10-08", estimated: true },
    { id: "eg-coptic-christmas-2027", nameAr: "عيد الميلاد المجيد", nameEn: "Coptic Christmas", start: "2027-01-07", end: "2027-01-07" },
    { id: "eg-revolution-2027", nameAr: "عيد ثورة 25 يناير وعيد الشرطة", nameEn: "January 25 Revolution and Police Day", start: "2027-01-28", end: "2027-01-28", estimated: true },
    eidFitr("eg-eid-fitr-2027", "2027-03-09", "2027-03-12"),
    { id: "eg-sinai-2027", nameAr: "عيد تحرير سيناء", nameEn: "Sinai Liberation Day", start: "2027-04-29", end: "2027-04-29", estimated: true },
    labourDay("eg-labour-day-2027", "2027-05-01"),
    { id: "eg-sham-el-nessim-2027", nameAr: "شم النسيم", nameEn: "Sham El Nessim", start: "2027-05-03", end: "2027-05-03" },
    eidAdha("eg-eid-adha-2027", "2027-05-16", "2027-05-20"),
  ],
  TN: [
    { id: "tn-evacuation-2026", nameAr: "عيد الجلاء", nameEn: "Evacuation Day", start: "2026-10-15", end: "2026-10-15" },
    { id: "tn-winter-break-2026", nameAr: "عطلة الشتاء", nameEn: "Winter break", start: "2026-12-13", end: "2026-12-27" },
    newYear("tn-new-year-2027", "2027-01-01"),
    { id: "tn-spring-break-2027", nameAr: "عطلة الربيع", nameEn: "Spring break", start: "2027-03-20", end: "2027-04-04" },
    { id: "tn-martyrs-2027", nameAr: "عيد الشهداء", nameEn: "Martyrs' Day", start: "2027-04-09", end: "2027-04-09" },
    labourDay("tn-labour-day-2027", "2027-05-01"),
  ],
  // The ministry gives the Eids in Hijri dates (Fitr 29 Ramadan – 2 Shawwal,
  // "3 or 4 days"; Adha 9–11 Dhu al-Hijjah). Morocco's sighting often lands a
  // day after Umm al-Qura, so each Eid spans both possibilities.
  MA: [
    { id: "ma-unity-day-2026", nameAr: "عيد الوحدة", nameEn: "Unity Day", start: "2026-10-31", end: "2026-10-31" },
    { id: "ma-green-march-2026", nameAr: "ذكرى المسيرة الخضراء", nameEn: "Green March Day", start: "2026-11-06", end: "2026-11-06" },
    { id: "ma-independence-2026", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2026-11-18", end: "2026-11-18" },
    newYear("ma-new-year-2027", "2027-01-01"),
    { id: "ma-manifesto-2027", nameAr: "ذكرى تقديم وثيقة الاستقلال", nameEn: "Independence Manifesto Day", start: "2027-01-11", end: "2027-01-11" },
    { id: "ma-amazigh-new-year-2027", nameAr: "رأس السنة الأمازيغية", nameEn: "Amazigh New Year", start: "2027-01-14", end: "2027-01-14" },
    { id: "ma-semester-break-2027", nameAr: "عطلة نهاية الفصل الأول", nameEn: "End of first semester break", start: "2027-01-24", end: "2027-01-31" },
    eidFitr("ma-eid-fitr-2027", "2027-03-08", "2027-03-11"),
    labourDay("ma-labour-day-2027", "2027-05-01"),
    { id: "ma-spring-break-2027", nameAr: "عطلة فصل الربيع", nameEn: "Spring break", start: "2027-05-09", end: "2027-05-16" },
    eidAdha("ma-eid-adha-2027", "2027-05-15", "2027-05-18"),
    hijriNewYear("ma-hijri-2027", "2027-06-06"),
  ],
  // Public holidays only: the ministry hasn't published the 2026/2027
  // university breaks yet. Each Eid is 3 days by law; the sighting has landed
  // both on and a day after Umm al-Qura, so each spans both.
  DZ: [
    { id: "dz-revolution-2026", nameAr: "عيد الثورة", nameEn: "Revolution Day", start: "2026-11-01", end: "2026-11-01" },
    newYear("dz-new-year-2027", "2027-01-01"),
    { id: "dz-yennayer-2027", nameAr: "رأس السنة الأمازيغية", nameEn: "Amazigh New Year", start: "2027-01-12", end: "2027-01-12" },
    eidFitr("dz-eid-fitr-2027", "2027-03-09", "2027-03-12"),
    labourDay("dz-labour-day-2027", "2027-05-01"),
    eidAdha("dz-eid-adha-2027", "2027-05-16", "2027-05-19"),
    hijriNewYear("dz-hijri-2027", "2027-06-06"),
    { id: "dz-ashura-2027", nameAr: "عاشوراء", nameEn: "Ashura", start: "2027-06-15", end: "2027-06-15", estimated: true },
    { id: "dz-independence-2027", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2027-07-05", end: "2027-07-05" },
  ],
  PS: [
    { id: "ps-independence-2026", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2026-11-15", end: "2026-11-15" },
    { id: "ps-christmas-2026", nameAr: "عيد الميلاد المجيد (الغربي)", nameEn: "Christmas (Western)", start: "2026-12-25", end: "2026-12-25" },
    newYear("ps-new-year-2027", "2027-01-01"),
    { id: "ps-isra-2027", nameAr: "الإسراء والمعراج", nameEn: "Isra and Mi'raj", start: "2027-01-04", end: "2027-01-04", estimated: true },
    { id: "ps-orthodox-christmas-2027", nameAr: "عيد الميلاد المجيد (الشرقي)", nameEn: "Christmas (Eastern)", start: "2027-01-07", end: "2027-01-07" },
    eidFitr("ps-eid-fitr-2027", "2027-03-10", "2027-03-11"),
    labourDay("ps-labour-day-2027", "2027-05-01"),
    { id: "ps-easter-2027", nameAr: "عيد الفصح", nameEn: "Easter", start: "2027-05-02", end: "2027-05-02" },
    eidAdha("ps-eid-adha-2027", "2027-05-15", "2027-05-19"),
    hijriNewYear("ps-hijri-2027", "2027-06-06"),
  ],
  IQ: [
    mawlid("iq-mawlid-2026", "2026-08-25"),
    newYear("iq-new-year-2027", "2027-01-01"),
    { id: "iq-army-day-2027", nameAr: "عيد الجيش العراقي", nameEn: "Army Day", start: "2027-01-06", end: "2027-01-06" },
    eidFitr("iq-eid-fitr-2027", "2027-03-09", "2027-03-12"),
    { id: "iq-remembrance-2027", nameAr: "ذكرى جرائم البعث بحق الشعب العراقي", nameEn: "Remembrance of the Baath regime's crimes", start: "2027-03-16", end: "2027-03-16" },
    { id: "iq-nowruz-2027", nameAr: "عيد نوروز", nameEn: "Nowruz", start: "2027-03-21", end: "2027-03-21" },
    labourDay("iq-labour-day-2027", "2027-05-01"),
    eidAdha("iq-eid-adha-2027", "2027-05-16", "2027-05-20"),
    { id: "iq-ghadir-2027", nameAr: "يوم الغدير", nameEn: "Eid al-Ghadir", start: "2027-05-24", end: "2027-05-24", estimated: true },
    hijriNewYear("iq-hijri-2027", "2027-06-06"),
    { id: "iq-ashura-2027", nameAr: "عاشوراء", nameEn: "Ashura", start: "2027-06-15", end: "2027-06-15", estimated: true },
  ],
  SY: [
    mawlid("sy-mawlid-2026", "2026-08-25"),
    { id: "sy-liberation-2026", nameAr: "عيد التحرير", nameEn: "Liberation Day", start: "2026-12-08", end: "2026-12-08" },
    { id: "sy-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas", start: "2026-12-25", end: "2026-12-25" },
    newYear("sy-new-year-2027", "2027-01-01"),
    eidFitr("sy-eid-fitr-2027", "2027-03-09", "2027-03-12"),
    { id: "sy-revolution-2027", nameAr: "عيد الثورة السورية", nameEn: "Syrian Revolution Day", start: "2027-03-18", end: "2027-03-18" },
    { id: "sy-mothers-day-2027", nameAr: "عيد الأم", nameEn: "Mother's Day", start: "2027-03-21", end: "2027-03-21" },
    { id: "sy-easter-2027", nameAr: "عيد الفصح (الغربي)", nameEn: "Easter (Western)", start: "2027-03-28", end: "2027-03-28" },
    { id: "sy-evacuation-2027", nameAr: "عيد الجلاء", nameEn: "Evacuation Day", start: "2027-04-17", end: "2027-04-17" },
    labourDay("sy-labour-day-2027", "2027-05-01"),
    { id: "sy-orthodox-easter-2027", nameAr: "عيد الفصح (الشرقي)", nameEn: "Easter (Eastern)", start: "2027-05-02", end: "2027-05-02" },
    eidAdha("sy-eid-adha-2027", "2027-05-16", "2027-05-20"),
    hijriNewYear("sy-hijri-2027", "2027-06-06"),
  ],
  LY: [
    { ...mawlid("ly-mawlid-2026", "2026-08-25"), estimated: false },
    { id: "ly-martyrs-2026", nameAr: "يوم الشهيد", nameEn: "Martyrs' Day", start: "2026-09-16", end: "2026-09-16" },
    { id: "ly-liberation-2026", nameAr: "عيد التحرير", nameEn: "Liberation Day", start: "2026-10-23", end: "2026-10-23" },
    { id: "ly-independence-2026", nameAr: "عيد الاستقلال", nameEn: "Independence Day", start: "2026-12-24", end: "2026-12-24" },
    { id: "ly-revolution-2027", nameAr: "عيد الثورة (17 فبراير)", nameEn: "February 17 Revolution Day", start: "2027-02-17", end: "2027-02-17" },
    eidFitr("ly-eid-fitr-2027", "2027-03-09", "2027-03-12"),
    labourDay("ly-labour-day-2027", "2027-05-01"),
    { ...eidAdha("ly-eid-adha-2027", "2027-05-15", "2027-05-19"), nameAr: "يوم عرفة وإجازة عيد الأضحى", nameEn: "Arafat Day and Eid al-Adha break" },
    hijriNewYear("ly-hijri-2027", "2027-06-06"),
  ],
  TR: [
    { id: "tr-victory-2026", nameAr: "عيد النصر", nameEn: "Victory Day", start: "2026-08-30", end: "2026-08-30" },
    { id: "tr-republic-2026", nameAr: "عيد الجمهورية", nameEn: "Republic Day", start: "2026-10-29", end: "2026-10-29" },
    newYear("tr-new-year-2027", "2027-01-01"),
    { ...eidFitr("tr-eid-fitr-2027", "2027-03-09", "2027-03-11"), estimated: false },
    { id: "tr-sovereignty-2027", nameAr: "عيد السيادة الوطنية والطفل", nameEn: "National Sovereignty and Children's Day", start: "2027-04-23", end: "2027-04-23" },
    labourDay("tr-labour-day-2027", "2027-05-01"),
    { ...eidAdha("tr-eid-adha-2027", "2027-05-16", "2027-05-19"), estimated: false },
    { id: "tr-democracy-2027", nameAr: "يوم الديمقراطية والوحدة الوطنية", nameEn: "Democracy and National Unity Day", start: "2027-07-15", end: "2027-07-15" },
  ],
  DE: [
    { id: "de-unity-2026", nameAr: "يوم الوحدة الألمانية", nameEn: "German Unity Day", start: "2026-10-03", end: "2026-10-03" },
    { id: "de-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas", start: "2026-12-25", end: "2026-12-26" },
    newYear("de-new-year-2027", "2027-01-01"),
    { id: "de-good-friday-2027", nameAr: "الجمعة العظيمة", nameEn: "Good Friday", start: "2027-03-26", end: "2027-03-26" },
    { id: "de-easter-monday-2027", nameAr: "اثنين الفصح", nameEn: "Easter Monday", start: "2027-03-29", end: "2027-03-29" },
    labourDay("de-labour-day-2027", "2027-05-01"),
    { id: "de-ascension-2027", nameAr: "عيد الصعود", nameEn: "Ascension Day", start: "2027-05-06", end: "2027-05-06" },
    { id: "de-whit-monday-2027", nameAr: "اثنين العنصرة", nameEn: "Whit Monday", start: "2027-05-17", end: "2027-05-17" },
  ],
  FR: [
    { id: "fr-assumption-2026", nameAr: "عيد انتقال السيدة العذراء", nameEn: "Assumption Day", start: "2026-08-15", end: "2026-08-15" },
    { id: "fr-all-saints-2026", nameAr: "عيد جميع القديسين", nameEn: "All Saints' Day", start: "2026-11-01", end: "2026-11-01" },
    { id: "fr-armistice-2026", nameAr: "ذكرى هدنة 1918", nameEn: "Armistice Day", start: "2026-11-11", end: "2026-11-11" },
    { id: "fr-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas", start: "2026-12-25", end: "2026-12-25" },
    newYear("fr-new-year-2027", "2027-01-01"),
    { id: "fr-easter-monday-2027", nameAr: "اثنين الفصح", nameEn: "Easter Monday", start: "2027-03-29", end: "2027-03-29" },
    labourDay("fr-labour-day-2027", "2027-05-01"),
    { id: "fr-ascension-2027", nameAr: "عيد الصعود", nameEn: "Ascension Day", start: "2027-05-06", end: "2027-05-06" },
    { id: "fr-victory-2027", nameAr: "ذكرى النصر 1945", nameEn: "Victory in Europe Day", start: "2027-05-08", end: "2027-05-08" },
    { id: "fr-whit-monday-2027", nameAr: "اثنين العنصرة", nameEn: "Whit Monday", start: "2027-05-17", end: "2027-05-17" },
    { id: "fr-bastille-2027", nameAr: "العيد الوطني", nameEn: "Bastille Day", start: "2027-07-14", end: "2027-07-14" },
  ],
  IE: [
    { id: "ie-august-2026", nameAr: "عطلة أغسطس", nameEn: "August Bank Holiday", start: "2026-08-03", end: "2026-08-03" },
    { id: "ie-october-2026", nameAr: "عطلة أكتوبر", nameEn: "October Bank Holiday", start: "2026-10-26", end: "2026-10-26" },
    { id: "ie-christmas-2026", nameAr: "عيد الميلاد المجيد ويوم القديس ستيفن", nameEn: "Christmas and St Stephen's Day", start: "2026-12-25", end: "2026-12-26" },
    newYear("ie-new-year-2027", "2027-01-01"),
    { id: "ie-brigid-2027", nameAr: "يوم القديسة بريجيد", nameEn: "St Brigid's Day", start: "2027-02-01", end: "2027-02-01" },
    { id: "ie-patrick-2027", nameAr: "يوم القديس باتريك", nameEn: "St Patrick's Day", start: "2027-03-17", end: "2027-03-17" },
    { id: "ie-easter-monday-2027", nameAr: "اثنين الفصح", nameEn: "Easter Monday", start: "2027-03-29", end: "2027-03-29" },
    { id: "ie-may-2027", nameAr: "عطلة مايو", nameEn: "May Bank Holiday", start: "2027-05-03", end: "2027-05-03" },
    { id: "ie-june-2027", nameAr: "عطلة يونيو", nameEn: "June Bank Holiday", start: "2027-06-07", end: "2027-06-07" },
    { id: "ie-august-2027", nameAr: "عطلة أغسطس", nameEn: "August Bank Holiday", start: "2027-08-02", end: "2027-08-02" },
  ],
  NZ: [
    { id: "nz-labour-day-2026", nameAr: "يوم العمال", nameEn: "Labour Day", start: "2026-10-26", end: "2026-10-26" },
    { id: "nz-christmas-2026", nameAr: "عيد الميلاد المجيد", nameEn: "Christmas Day", start: "2026-12-25", end: "2026-12-25" },
    { id: "nz-boxing-day-2026", nameAr: "اليوم التالي لعيد الميلاد", nameEn: "Boxing Day (observed)", start: "2026-12-28", end: "2026-12-28" },
    newYear("nz-new-year-2027", "2027-01-01"),
    { id: "nz-new-year-2-2027", nameAr: "اليوم التالي لرأس السنة", nameEn: "Day after New Year's Day (observed)", start: "2027-01-04", end: "2027-01-04" },
    { id: "nz-waitangi-2027", nameAr: "يوم وايتانغي", nameEn: "Waitangi Day (observed)", start: "2027-02-08", end: "2027-02-08" },
    { id: "nz-good-friday-2027", nameAr: "الجمعة العظيمة", nameEn: "Good Friday", start: "2027-03-26", end: "2027-03-26" },
    { id: "nz-easter-monday-2027", nameAr: "اثنين الفصح", nameEn: "Easter Monday", start: "2027-03-29", end: "2027-03-29" },
    { id: "nz-anzac-2027", nameAr: "يوم أنزاك", nameEn: "Anzac Day (observed)", start: "2027-04-26", end: "2027-04-26" },
    { id: "nz-kings-birthday-2027", nameAr: "عيد ميلاد الملك", nameEn: "King's Birthday", start: "2027-06-07", end: "2027-06-07" },
    { id: "nz-matariki-2027", nameAr: "ماتاريكي", nameEn: "Matariki", start: "2027-06-25", end: "2027-06-25" },
  ],
};

export interface UniversityCalendar {
  country: string;
  nameAr: string;
  nameEn: string;
  holidays: CountryHoliday[];
}

const without = (list: CountryHoliday[], ids: string[]) => list.filter((h) => !ids.includes(h.id));

/** A university whose own 2026-2027 calendar we've read: its holidays AND its
 *  own breaks (a mid-term break, a Christmas break), which the country's list
 *  leaves out. Keyed by the catalogue slug (lib/gradeCatalog) where it has one.
 *  A university whose calendar holds nothing beyond its country's list (Yarmouk,
 *  University of Bahrain, Sultan Qaboos, AU Kuwait, UAE University) needs no
 *  entry. Sources:
 *    Qatar University 2026/2027 academic calendar.
 *    University of Sharjah 2026/2027 academic calendar.
 *    American University in Dubai 2026-2027 calendar (updated 14 July 2026).
 *    Khalifa University 2026-2027 undergraduate academic calendar.
 *    American University of Sharjah 2026-2027 academic calendar (its Sunday
 *    make-up class days aren't modelled).
 *    Ajman University 2026-2027 academic calendar (Office of the Registrar).
 *    Abu Dhabi University 2026-2027 academic year calendar (its Eid al-Adha
 *    includes Arafat Day, 15 May).
 *    American University of Beirut 2026-2027 university calendar (4 Sept 2026).
 *    The American University in Cairo 2026-2027 calendar (5 Aug 2026).
 *    Palestine Technical University – Kadoorie 2026-2027 calendar. */
export const UNIVERSITY_HOLIDAYS: Record<string, UniversityCalendar> = {
  "qatar-university": {
    country: "QA",
    nameAr: "جامعة قطر",
    nameEn: "Qatar University",
    holidays: [
      { id: "qu-mid-fall-2026", nameAr: "إجازة منتصف الخريف", nameEn: "Mid-fall break", start: "2026-10-25", end: "2026-10-29" },
      { id: "qu-mid-year-2026", nameAr: "إجازة منتصف العام الأكاديمي", nameEn: "Mid-academic-year break", start: "2026-12-27", end: "2027-01-07" },
      ...COUNTRY_HOLIDAYS.QA,
    ],
  },
  "university-of-sharjah": {
    country: "AE",
    nameAr: "جامعة الشارقة",
    nameEn: "University of Sharjah",
    holidays: [
      { id: "shj-martyrs-2026", nameAr: "يوم الشهيد", nameEn: "Commemoration Day", start: "2026-12-01", end: "2026-12-01" },
      { id: "shj-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      { id: "shj-winter-break-2026", nameAr: "إجازة الشتاء", nameEn: "Winter break", start: "2026-12-16", end: "2027-01-10" },
      eidFitr("shj-eid-fitr-2027", "2027-03-08", "2027-03-11"),
      { id: "shj-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-05", end: "2027-04-08" },
      eidAdha("shj-eid-adha-2027", "2027-05-15", "2027-05-19"),
      hijriNewYear("shj-hijri-2027", "2027-06-06"),
    ],
  },
  "american-university-in-dubai": {
    country: "AE",
    nameAr: "الجامعة الأمريكية في دبي",
    nameEn: "American University in Dubai",
    holidays: [
      mawlid("aud-mawlid-2026", "2026-08-25"),
      { id: "aud-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      { id: "aud-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-03-08", end: "2027-03-12" },
      eidFitr("aud-eid-fitr-2027", "2027-03-08", "2027-03-09"),
      eidAdha("aud-eid-adha-2027", "2027-05-16", "2027-05-19"),
      hijriNewYear("aud-hijri-2027", "2027-06-06"),
    ],
  },
  "khalifa-university": {
    country: "AE",
    nameAr: "جامعة خليفة",
    nameEn: "Khalifa University",
    holidays: [
      { id: "ku-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      { id: "ku-winter-break-2026", nameAr: "إجازة الشتاء", nameEn: "Winter break", start: "2026-12-21", end: "2027-01-10" },
      eidFitr("ku-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      { id: "ku-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-05", end: "2027-04-09" },
      eidAdha("ku-eid-adha-2027", "2027-05-17", "2027-05-19"),
    ],
  },
  "american-university-of-sharjah": {
    country: "AE",
    nameAr: "الجامعة الأمريكية في الشارقة",
    nameEn: "American University of Sharjah",
    holidays: [
      { id: "aus-martyrs-2026", nameAr: "يوم الشهيد", nameEn: "Commemoration Day", start: "2026-12-01", end: "2026-12-01" },
      { id: "aus-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      eidFitr("aus-eid-fitr-2027", "2027-03-08", "2027-03-11"),
      { id: "aus-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-05", end: "2027-04-11" },
      eidAdha("aus-eid-adha-2027", "2027-05-17", "2027-05-20"),
      hijriNewYear("aus-hijri-2027", "2027-06-06"),
    ],
  },
  "ajman-university": {
    country: "AE",
    nameAr: "جامعة عجمان",
    nameEn: "Ajman University",
    holidays: [
      { id: "aju-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      { id: "aju-fall-break-2026", nameAr: "إجازة نهاية الفصل الأول", nameEn: "Fall semester break", start: "2026-12-21", end: "2027-01-01" },
      eidFitr("aju-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      { id: "aju-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-05", end: "2027-04-09" },
      eidAdha("aju-eid-adha-2027", "2027-05-15", "2027-05-18"),
      hijriNewYear("aju-hijri-2027", "2027-06-06"),
    ],
  },
  "abu-dhabi-university": {
    country: "AE",
    nameAr: "جامعة أبوظبي",
    nameEn: "Abu Dhabi University",
    holidays: [
      mawlid("adu-mawlid-2026", "2026-08-24"),
      { id: "adu-national-day-2026", nameAr: "عيد الاتحاد", nameEn: "UAE National Day", start: "2026-12-02", end: "2026-12-03" },
      { id: "adu-fall-break-2026", nameAr: "إجازة نهاية الفصل الأول", nameEn: "Fall break", start: "2026-12-13", end: "2027-01-03" },
      eidFitr("adu-eid-fitr-2027", "2027-03-10", "2027-03-12"),
      { id: "adu-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-12", end: "2027-04-18" },
      eidAdha("adu-eid-adha-2027", "2027-05-15", "2027-05-18"),
      hijriNewYear("adu-hijri-2027", "2027-06-06"),
    ],
  },
  "american-university-of-beirut": {
    country: "LB",
    nameAr: "الجامعة الأمريكية في بيروت",
    nameEn: "American University of Beirut",
    holidays: [
      { id: "aub-fall-break-2026", nameAr: "إجازة الخريف", nameEn: "Fall break", start: "2026-10-29", end: "2026-11-01" },
      { id: "aub-christmas-break-2026", nameAr: "إجازة عيد الميلاد ورأس السنة", nameEn: "Christmas and New Year break", start: "2026-12-24", end: "2027-01-01" },
      ...without(COUNTRY_HOLIDAYS.LB, ["lb-christmas-2026", "lb-new-year-2027"]),
    ],
  },
  "the-american-university-in-cairo": {
    country: "EG",
    nameAr: "الجامعة الأمريكية بالقاهرة",
    nameEn: "The American University in Cairo",
    holidays: [
      { id: "auc-thanksgiving-2026", nameAr: "عيد الشكر", nameEn: "Thanksgiving", start: "2026-11-26", end: "2026-11-26" },
      { id: "auc-christmas-2026", nameAr: "عيد الميلاد (الغربي)", nameEn: "Western Christmas", start: "2026-12-24", end: "2026-12-25" },
      newYear("auc-new-year-2027", "2027-01-01"),
      { id: "auc-epiphany-2027", nameAr: "عيد الغطاس", nameEn: "Epiphany", start: "2027-01-19", end: "2027-01-19" },
      { id: "auc-western-easter-2027", nameAr: "عيد الفصح (الغربي)", nameEn: "Western Easter", start: "2027-03-28", end: "2027-03-28" },
      { id: "auc-spring-break-2027", nameAr: "إجازة الربيع", nameEn: "Spring break", start: "2027-04-25", end: "2027-04-29" },
      { id: "auc-eastern-easter-2027", nameAr: "عيد القيامة", nameEn: "Eastern Easter", start: "2027-05-02", end: "2027-05-02" },
      ...COUNTRY_HOLIDAYS.EG,
    ],
  },
  ptuk: {
    country: "PS",
    nameAr: "جامعة فلسطين التقنية - خضوري",
    nameEn: "Palestine Technical University – Kadoorie",
    holidays: [
      { id: "ptuk-womens-day-2027", nameAr: "يوم المرأة", nameEn: "Women's Day", start: "2027-03-08", end: "2027-03-08" },
      ...COUNTRY_HOLIDAYS.PS,
    ],
  },
};

/** A calendar the admin published (public.university_calendars) — reached
 *  after the app was built, from an official source or from what the
 *  university's students reported. `names` are the typed names (normalised)
 *  that point to it, for a university outside the catalogue. */
export interface PublishedCalendar extends UniversityCalendar {
  names: string[];
  status: "suggested" | "verified";
  /** official = read from the university's own calendar · students = what
   *  its students confirmed */
  source: "official" | "students";
}

// Filled at run time (lib/publishedCalendars) once the student's own calendar
// — or, on the admin dashboard, every calendar — has been fetched.
const PUBLISHED: Record<string, PublishedCalendar> = {};

export function registerPublishedCalendar(key: string, calendar: PublishedCalendar | null): void {
  if (calendar) PUBLISHED[key] = calendar;
  else delete PUBLISHED[key];
}

/** Every published calendar registered so far. */
export function publishedCalendars(): [string, PublishedCalendar][] {
  return Object.entries(PUBLISHED);
}

/** A university's own calendar: one from the code first, else one published. */
export function universityCalendar(key: string): UniversityCalendar | PublishedCalendar | undefined {
  return UNIVERSITY_HOLIDAYS[key] ?? PUBLISHED[key];
}

/** The holidays for a calendar key (lib/universityCountry): a university of
 *  ours, else a country. "SA" isn't here — Saudi uses lib/holidays' rules. */
export function holidaysForCalendar(key: string): CountryHoliday[] {
  return universityCalendar(key)?.holidays ?? COUNTRY_HOLIDAYS[key] ?? [];
}
