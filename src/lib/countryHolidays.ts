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

// ── Calendars checked against each university's own 2026-2027 calendar ─────
// (research audit, October 2026: research/gpa-calendar-audit/*_READY_FOR_TRANSFER.md).
// What the university's calendar doesn't mention is kept from its country's
// list (marked "from the country" below), so a holiday is never dropped only
// because one calendar left it out. Holidays for one faith only (Nahda's
// Christian holidays, PSUT's Palm Sunday and Easter) aren't listed: they don't
// apply to every student.

const h = (id: string, nameAr: string, nameEn: string, start: string, end = start, estimated?: boolean): CountryHoliday =>
  estimated ? { id, nameAr, nameEn, start, end, estimated } : { id, nameAr, nameEn, start, end };
/** The country's holiday with this id (to keep one the university's calendar leaves out). */
const fromCountry = (country: string, id: string): CountryHoliday => COUNTRY_HOLIDAYS[country].find((x) => x.id === id)!;
const arafatAdha = (id: string, start: string, end: string): CountryHoliday =>
  h(id, "يوم عرفة وإجازة عيد الأضحى", "Arafat Day and Eid al-Adha break", start, end, true);
const ashura = (id: string, start: string, end = start): CountryHoliday => h(id, "عاشوراء", "Ashura", start, end, true);
const isra = (id: string, start: string, end = start): CountryHoliday => h(id, "الإسراء والمعراج", "Isra and Mi'raj", start, end, true);

const BH_NATIONAL = (p: string) => h(`${p}-national-day-2026`, "العيد الوطني", "National Day", "2026-12-16", "2026-12-17");
const QA_NATIONAL = (p: string, day = "2026-12-18") => h(`${p}-national-day-2026`, "اليوم الوطني", "Qatar National Day", day);
const QA_SPORT = (p: string) => h(`${p}-sport-day-2027`, "اليوم الرياضي للدولة", "National Sport Day", "2027-02-09");
const AE_MARTYRS = (p: string) => h(`${p}-martyrs-2026`, "يوم الشهيد", "Commemoration Day", "2026-12-01");
const LB = (p: string) => ({
  independence: (start = "2026-11-22", end = start) => h(`${p}-independence-2026`, "عيد الاستقلال", "Independence Day", start, end),
  maroun: () => h(`${p}-st-maroun-2027`, "عيد مار مارون", "St. Maroun's Day", "2027-02-09"),
  hariri: (estimated?: boolean) => h(`${p}-hariri-2027`, "ذكرى الرئيس رفيق الحريري", "Rafic Hariri Memorial Day", "2027-02-14", "2027-02-14", estimated),
  annunciation: () => h(`${p}-annunciation-2027`, "عيد البشارة", "Annunciation Day", "2027-03-25"),
  easter: (start = "2027-03-26", end = "2027-03-29") => h(`${p}-easter-2027`, "عيد الفصح (الغربي)", "Easter (Western)", start, end),
  orthodoxEaster: () => h(`${p}-orthodox-easter-2027`, "عيد الفصح (الشرقي)", "Easter (Eastern)", "2027-04-30", "2027-05-03"),
  armenianChristmas: (end = "2027-01-06") => h(`${p}-armenian-christmas-2027`, "عيد الميلاد عند الأرمن", "Armenian Christmas", "2027-01-06", end),
  liberation: () => h(`${p}-liberation-2027`, "عيد المقاومة والتحرير", "Resistance and Liberation Day", "2027-05-25"),
  assumption: (day = "2027-08-15") => h(`${p}-assumption-2027`, "عيد انتقال السيدة العذراء", "Assumption Day", day),
});

const AUDITED_HOLIDAYS: Record<string, UniversityCalendar> = {
  // ── Bahrain (University of Bahrain's calendar is the country's list) ──
  "ahlia-university": {
    country: "BH", nameAr: "الجامعة الأهلية", nameEn: "Ahlia University",
    holidays: [
      BH_NATIONAL("ahlia"),
      newYear("ahlia-new-year-2027", "2027-01-01"),
      h("ahlia-semester-break-2027", "إجازة بين الفصلين", "Semester break", "2027-01-24", "2027-02-06"),
      eidFitr("ahlia-eid-fitr-2027", "2027-03-11", "2027-03-13"),
      labourDay("ahlia-labour-day-2027", "2027-05-01"),
      arafatAdha("ahlia-eid-adha-2027", "2027-05-16", "2027-05-19"),
      hijriNewYear("ahlia-hijri-2027", "2027-06-06"),
      ashura("ahlia-ashura-2027", "2027-06-14", "2027-06-15"),
      h("ahlia-mawlid-2027", "المولد النبوي (والتعويض عنه)", "Prophet's Birthday (and the day in lieu)", "2027-08-14", "2027-08-15", true),
    ],
  },
  "gulf-university": {
    country: "BH", nameAr: "الجامعة الخليجية", nameEn: "Gulf University",
    holidays: [
      BH_NATIONAL("gu"),
      newYear("gu-new-year-2027", "2027-01-01"),
      h("gu-student-break-2027", "عطلة الطلبة", "Student break", "2027-01-09", "2027-01-16"),
      eidFitr("gu-eid-fitr-2027", "2027-03-10", "2027-03-12"),
      labourDay("gu-labour-day-2027", "2027-05-01"),
      arafatAdha("gu-eid-adha-2027", "2027-05-16", "2027-05-19"),
      hijriNewYear("gu-hijri-2027", "2027-06-06"),
      ashura("gu-ashura-2027", "2027-06-15", "2027-06-16"),
    ],
  },
  "kingdom-university": {
    country: "BH", nameAr: "جامعة المملكة", nameEn: "Kingdom University",
    holidays: [
      BH_NATIONAL("ku-bh"),
      newYear("ku-bh-new-year-2027", "2027-01-01"),
      eidFitr("ku-bh-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      labourDay("ku-bh-labour-day-2027", "2027-05-01"),
      arafatAdha("ku-bh-eid-adha-2027", "2027-05-15", "2027-05-18"),
      hijriNewYear("ku-bh-hijri-2027", "2027-06-06"),
      ashura("ku-bh-ashura-2027", "2027-06-14", "2027-06-15"),
    ],
  },
  "royal-university-for-women": {
    country: "BH", nameAr: "الجامعة الملكية للبنات", nameEn: "Royal University for Women",
    holidays: [
      h("ruw-mid-fall-2026", "إجازة منتصف الفصل", "Mid-semester break", "2026-11-15", "2026-11-21"),
      BH_NATIONAL("ruw"),
      h("ruw-semester-break-2027", "إجازة بين الفصلين", "Semester break", "2027-01-10", "2027-01-23"),
      eidFitr("ruw-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      h("ruw-mid-spring-2027", "إجازة منتصف الفصل", "Mid-semester break", "2027-03-28", "2027-04-03"),
      labourDay("ruw-labour-day-2027", "2027-05-01"),
      arafatAdha("ruw-eid-adha-2027", "2027-05-16", "2027-05-19"),
      hijriNewYear("ruw-hijri-2027", "2027-06-06"),
      ashura("ruw-ashura-2027", "2027-06-14", "2027-06-15"),
      mawlid("ruw-mawlid-2027", "2027-08-15"),
    ],
  },
  "university-of-technology-bahrain": {
    country: "BH", nameAr: "جامعة البحرين للتكنولوجيا", nameEn: "University of Technology Bahrain",
    holidays: [
      BH_NATIONAL("utb"),
      h("utb-break-1-2026", "إجازة بين الفصلين", "Term break", "2026-12-16", "2027-01-09"),
      newYear("utb-new-year-2027", "2027-01-01"),
      eidFitr("utb-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      h("utb-break-2-2027", "إجازة بين الفصلين", "Term break", "2027-04-18", "2027-05-02"),
      labourDay("utb-labour-day-2027", "2027-05-01"),
      eidAdha("utb-eid-adha-2027", "2027-05-15", "2027-05-18"),
      hijriNewYear("utb-hijri-2027", "2027-06-06"),
      ashura("utb-ashura-2027", "2027-06-14", "2027-06-15"),
      mawlid("utb-mawlid-2027", "2027-08-15"),
    ],
  },
  // ── Qatar (Qatar University above) ──
  "university-of-doha-for-science-and-technology": {
    country: "QA", nameAr: "جامعة الدوحة للعلوم والتكنولوجيا", nameEn: "University of Doha for Science and Technology",
    holidays: [
      h("udst-mid-fall-2026", "إجازة منتصف الفصل", "Mid-semester break", "2026-10-18", "2026-10-22"),
      QA_NATIONAL("udst"),
      QA_SPORT("udst"),
      eidFitr("udst-eid-fitr-2027", "2027-03-07", "2027-03-12"),
      eidAdha("udst-eid-adha-2027", "2027-05-15", "2027-05-19"),
    ],
  },
  "hamad-bin-khalifa-university": {
    country: "QA", nameAr: "جامعة حمد بن خليفة", nameEn: "Hamad Bin Khalifa University",
    holidays: [
      h("hbku-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-11", "2026-10-17"),
      QA_NATIONAL("hbku"),
      QA_SPORT("hbku"),
      h("hbku-eid-spring-2027", "إجازة عيد الفطر والربيع", "Eid al-Fitr and spring break", "2027-03-07", "2027-03-13", true),
      fromCountry("QA", "qa-eid-adha-2027"), // from the country
    ],
  },
  "georgetown-university-school-of-foreign-service-in-qatar": {
    country: "QA", nameAr: "جامعة جورجتاون في قطر", nameEn: "Georgetown University in Qatar",
    holidays: [
      h("gu-q-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-11", "2026-10-15"),
      QA_NATIONAL("gu-q"), // from the country
      h("gu-q-spring-break-2027", "اليوم الرياضي وإجازة الربيع", "National Sport Day and spring break", "2027-02-09", "2027-02-11"),
      eidFitr("gu-q-eid-fitr-2027", "2027-03-07", "2027-03-11"),
      h("gu-q-no-classes-2027", "لا دراسة", "No classes", "2027-03-28"),
      eidAdha("gu-q-eid-adha-2027", "2027-05-16", "2027-05-20"),
    ],
  },
  "northwestern-university-in-qatar": {
    country: "QA", nameAr: "جامعة نورثويسترن في قطر", nameEn: "Northwestern University in Qatar",
    holidays: [
      h("nu-q-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-09", "2026-10-17"),
      QA_NATIONAL("nu-q"), // from the country
      QA_SPORT("nu-q"), // from the country
      h("nu-q-spring-break-2027", "إجازة الربيع", "Spring break", "2027-02-19", "2027-02-22"),
      eidFitr("nu-q-eid-fitr-2027", "2027-03-05", "2027-03-13"),
      fromCountry("QA", "qa-eid-adha-2027"), // from the country
    ],
  },
  "carnegie-mellon-university-in-qatar": {
    country: "QA", nameAr: "جامعة كارنيجي ميلون في قطر", nameEn: "Carnegie Mellon University in Qatar",
    holidays: [
      h("cmu-q-no-classes-1-2026", "لا دراسة", "No classes", "2026-09-13", "2026-09-14"),
      h("cmu-q-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-11", "2026-10-15"),
      h("cmu-q-no-classes-2-2026", "لا دراسة", "No classes", "2026-11-11", "2026-11-12"),
      QA_NATIONAL("cmu-q"), // from the country
      h("cmu-q-sport-2027", "اليوم الرياضي ولا دراسة", "National Sport Day and no classes", "2027-02-09", "2027-02-11"),
      eidFitr("cmu-q-eid-fitr-2027", "2027-03-07", "2027-03-11"),
      h("cmu-q-no-classes-3-2027", "لا دراسة", "No classes", "2027-04-04", "2027-04-05"),
      eidAdha("cmu-q-eid-adha-2027", "2027-05-16", "2027-05-20"),
    ],
  },
  "lusail-university": {
    country: "QA", nameAr: "جامعة لوسيل", nameEn: "Lusail University",
    holidays: [
      QA_NATIONAL("lusail", "2026-12-17"),
      QA_SPORT("lusail"),
      h("lusail-mid-spring-2027", "إجازة منتصف الفصل (والفطر)", "Mid-semester break (and Eid al-Fitr)", "2027-02-28", "2027-03-11"),
      eidAdha("lusail-eid-adha-2027", "2027-05-16", "2027-05-20"),
    ],
  },
  "virginia-commonwealth-university-in-qatar": {
    country: "QA", nameAr: "جامعة فرجينيا كومنولث في قطر", nameEn: "Virginia Commonwealth University in Qatar",
    holidays: [
      h("vcu-q-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-11", "2026-10-15"),
      QA_NATIONAL("vcu-q"),
      h("vcu-q-spring-break-2027", "إجازة الربيع (واليوم الرياضي)", "Spring break (and National Sport Day)", "2027-02-08", "2027-02-11"),
      eidFitr("vcu-q-eid-fitr-2027", "2027-03-07", "2027-03-11"),
      eidAdha("vcu-q-eid-adha-2027", "2027-05-16", "2027-05-19"),
    ],
  },
  // ── Kuwait (the Australian University's calendar is the country's list) ──
  "american-university-of-kuwait": {
    country: "KW", nameAr: "الجامعة الأمريكية في الكويت", nameEn: "American University of Kuwait",
    holidays: [
      h("auk-winter-closure-2026", "عطلة الشتاء (الجامعة مغلقة)", "Winter break (university closed)", "2026-12-24", "2026-12-31"),
      h("auk-new-year-2027", "رأس السنة الميلادية", "New Year", "2027-01-01", "2027-01-02"),
      isra("auk-isra-2027", "2027-01-07", "2027-01-09"),
      h("auk-national-days-2027", "العيد الوطني وعيد التحرير", "National and Liberation Day", "2027-02-25", "2027-02-27"),
      eidFitr("auk-eid-fitr-2027", "2027-03-09", "2027-03-13"),
      eidAdha("auk-eid-adha-2027", "2027-05-15", "2027-05-22"),
      hijriNewYear("auk-hijri-2027", "2027-06-05"),
      mawlid("auk-mawlid-2027", "2027-08-14"),
    ],
  },
  "american-international-university-aiu": {
    country: "KW", nameAr: "الجامعة الأمريكية الدولية", nameEn: "American International University",
    holidays: [
      mawlid("aiu-mawlid-2026", "2026-08-27"),
      h("aiu-winter-closure-2026", "إغلاق الشتاء", "Winter closure", "2026-12-19", "2027-01-02"),
      isra("aiu-isra-2027", "2027-01-06"),
      h("aiu-no-classes-1-2027", "لا دراسة", "No classes", "2027-02-11"),
      h("aiu-national-days-2027", "العيد الوطني وعيد التحرير", "National and Liberation Day", "2027-02-25", "2027-02-26"),
      h("aiu-spring-break-2027", "إجازة الربيع والفطر", "Spring break and Eid al-Fitr", "2027-03-07", "2027-03-12", true),
      h("aiu-no-classes-2-2027", "لا دراسة", "No classes", "2027-03-25"),
      h("aiu-no-classes-3-2027", "لا دراسة", "No classes", "2027-04-19"),
      arafatAdha("aiu-eid-adha-2027", "2027-05-16", "2027-05-19"),
    ],
  },
  // ── UAE (Abu Dhabi, Ajman, AUD, AUS, Sharjah and Khalifa above) ──
  "american-university-of-ras-al-khaimah": {
    country: "AE", nameAr: "الجامعة الأمريكية في رأس الخيمة", nameEn: "American University of Ras Al Khaimah",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-eid-fitr-2027"]),
      AE_MARTYRS("aurak"),
      eidFitr("aurak-eid-fitr-2027", "2027-03-08", "2027-03-10"),
    ],
  },
  "gulf-medical-university": {
    country: "AE", nameAr: "جامعة الخليج الطبية", nameEn: "Gulf Medical University",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-eid-fitr-2027", "ae-eid-adha-2027"]),
      eidFitr("gmu-eid-fitr-2027", "2027-03-08", "2027-03-12"),
      eidAdha("gmu-eid-adha-2027", "2027-05-15", "2027-05-18"),
    ],
  },
  "mohammed-bin-rashid-university-of-medicine-and-health-sciences": {
    // its MD phases 1 and 2
    country: "AE", nameAr: "جامعة محمد بن راشد للطب والعلوم الصحية", nameEn: "Mohammed Bin Rashid University of Medicine and Health Sciences",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-spring-break-2027", "ae-eid-adha-2027"]),
      h("mbru-spring-break-2027", "إجازة الربيع", "Spring break", "2027-03-22", "2027-04-02"),
      eidAdha("mbru-eid-adha-2027", "2027-05-16", "2027-05-21"),
    ],
  },
  "new-york-university-abu-dhabi": {
    country: "AE", nameAr: "جامعة نيويورك أبوظبي", nameEn: "New York University Abu Dhabi",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-eid-fitr-2027", "ae-spring-break-2027", "ae-eid-adha-2027"]),
      h("nyuad-no-classes-2026", "لا محاضرات (اختبارات مقررات السبعة أسابيع)", "No classes (7-week course exams)", "2026-10-18", "2026-10-22"),
      h("nyuad-fall-break-2026", "إجازة الخريف", "Fall break", "2026-10-23", "2026-10-25"),
      h("nyuad-spring-break-2027", "إجازة الربيع وعيد الفطر", "Spring break and Eid al-Fitr", "2027-03-08", "2027-03-12", true),
      eidAdha("nyuad-eid-adha-2027", "2027-05-17", "2027-05-19"),
    ],
  },
  "university-of-dubai": {
    country: "AE", nameAr: "جامعة دبي", nameEn: "University of Dubai",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-eid-adha-2027"]),
      eidAdha("ud-eid-adha-2027", "2027-05-16", "2027-05-18"),
    ],
  },
  "university-of-fujairah": {
    country: "AE", nameAr: "جامعة الفجيرة", nameEn: "University of Fujairah",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.AE, ["ae-spring-break-2027"]),
      AE_MARTYRS("uof"),
      h("uof-spring-break-2027", "إجازة الربيع", "Spring break", "2027-04-05", "2027-04-11"),
    ],
  },
  // ── Oman ──
  "sultan-qaboos-university": {
    country: "OM", nameAr: "جامعة السلطان قابوس", nameEn: "Sultan Qaboos University",
    holidays: [
      // National Day on 20 Nov (Hanaa's decision, 2026-10-12: the calendar the
      // university's page links; an older copy says 18 Nov).
      h("squ-national-day-2026", "العيد الوطني", "National Day", "2026-11-20"),
      ...without(COUNTRY_HOLIDAYS.OM, ["om-national-day-2026"]),
      mawlid("squ-mawlid-2027", "2027-08-14"),
    ],
  },
  "dhofar-university": {
    country: "OM", nameAr: "جامعة ظفار", nameEn: "Dhofar University",
    holidays: [
      h("du-national-day-2026", "العيد الوطني", "National Day", "2026-11-25", "2026-11-26"),
      isra("du-isra-2027", "2027-01-06"),
      h("du-accession-2027", "ذكرى تولي السلطان مقاليد الحكم", "Sultan's Accession Day", "2027-01-11"),
      eidFitr("du-eid-fitr-2027", "2027-03-10", "2027-03-11"),
      eidAdha("du-eid-adha-2027", "2027-05-16", "2027-05-20"),
      hijriNewYear("du-hijri-2027", "2027-06-06"),
    ],
  },
  "muscat-university": {
    country: "OM", nameAr: "جامعة مسقط", nameEn: "Muscat University",
    holidays: [
      h("mu-national-day-2026", "العيد الوطني", "National Day", "2026-11-25", "2026-11-26"),
      isra("mu-isra-2027", "2027-01-07"),
      h("mu-accession-2027", "ذكرى تولي السلطان مقاليد الحكم", "Sultan's Accession Day", "2027-01-14"),
      eidFitr("mu-eid-fitr-2027", "2027-03-09", "2027-03-09"),
      eidAdha("mu-eid-adha-2027", "2027-05-16", "2027-05-16"),
      hijriNewYear("mu-hijri-2027", "2027-06-06"),
      mawlid("mu-mawlid-2027", "2027-08-14"),
    ],
  },
  // ── Jordan (others' calendars hold nothing beyond the country's list) ──
  "german-jordanian-university-gju": {
    country: "JO", nameAr: "الجامعة الألمانية الأردنية", nameEn: "German Jordanian University",
    holidays: [
      ...COUNTRY_HOLIDAYS.JO,
      h("gju-study-break-2026", "استراحة دراسية", "Study break", "2026-12-27", "2026-12-31"),
    ],
  },
  "princess-sumaya-university-for-technology-psut": {
    country: "JO", nameAr: "جامعة الأميرة سمية للتكنولوجيا", nameEn: "Princess Sumaya University for Technology",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.JO, ["jo-christmas-2026", "jo-eid-fitr-2027", "jo-eid-adha-2027"]),
      h("psut-winter-break-2026", "إجازة الشتاء", "Winter break", "2026-12-25", "2026-12-31"),
      eidFitr("psut-eid-fitr-2027", "2027-03-09", "2027-03-12"),
      eidAdha("psut-eid-adha-2027", "2027-05-16", "2027-05-19"),
    ],
  },
  "mutah-university": {
    country: "JO", nameAr: "جامعة مؤتة", nameEn: "Mutah University",
    holidays: [
      ...without(COUNTRY_HOLIDAYS.JO, ["jo-eid-fitr-2027", "jo-eid-adha-2027"]),
      eidFitr("mutah-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      eidAdha("mutah-eid-adha-2027", "2027-05-16", "2027-05-19"),
    ],
  },
  // ── Egypt ──
  "nahda-university": {
    country: "EG", nameAr: "جامعة النهضة", nameEn: "Nahda University",
    holidays: [
      mawlid("nub-mawlid-2026", "2026-08-27"), // from the country
      h("nub-victory-2026", "عيد النصر", "Victory Day", "2026-10-06", "2026-10-06", true),
      h("nub-christmas-2027", "عيد الميلاد المجيد", "Coptic Christmas", "2027-01-07"),
      h("nub-midyear-2027", "إجازة منتصف العام", "Mid-year break", "2027-01-23", "2027-02-04"),
      h("nub-police-2027", "عيد الشرطة وثورة 25 يناير", "Police Day and January 25 Revolution", "2027-01-25"),
      eidFitr("nub-eid-fitr-2027", "2027-03-09", "2027-03-11"),
      h("nub-sinai-2027", "عيد تحرير سيناء", "Sinai Liberation Day", "2027-04-25"),
      labourDay("nub-labour-day-2027", "2027-05-01"),
      h("nub-sham-el-nessim-2027", "شم النسيم", "Sham El Nessim", "2027-05-03"),
      eidAdha("nub-eid-adha-2027", "2027-05-16", "2027-05-19"),
      hijriNewYear("nub-hijri-2027", "2027-06-06"),
      h("nub-june-30-2027", "ذكرى 30 يونيو", "June 30 Revolution", "2027-06-30"),
    ],
  },
  // ── Lebanon (AUB above) ──
  "beirut-arab-university": {
    country: "LB", nameAr: "جامعة بيروت العربية", nameEn: "Beirut Arab University",
    holidays: (() => {
      const l = LB("bau");
      return [
        l.independence(),
        h("bau-christmas-2026", "عيد الميلاد المجيد", "Christmas", "2026-12-25"),
        h("bau-new-year-2026", "رأس السنة والميلاد عند الأرمن (لا دراسة)", "New Year and Armenian Christmas (no classes)", "2026-12-31", "2027-01-10"),
        l.maroun(),
        h("bau-eid-fitr-2027", "إجازة عيد الفطر (لا دراسة)", "Eid al-Fitr (no classes)", "2027-03-06", "2027-03-14", true),
        l.annunciation(),
        l.easter(),
        h("bau-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-03"),
        h("bau-eid-adha-2027", "إجازة عيد الأضحى (لا دراسة)", "Eid al-Adha (no classes)", "2027-05-15", "2027-05-23", true),
        l.liberation(),
      ];
    })(),
  },
  "holy-spirit-university-of-kaslik": {
    country: "LB", nameAr: "جامعة الروح القدس الكسليك", nameEn: "Holy Spirit University of Kaslik",
    holidays: (() => {
      const l = LB("usek");
      return [
        mawlid("usek-mawlid-2026", "2026-08-26"),
        h("usek-all-saints-2026", "عيد جميع القديسين", "All Saints' Day", "2026-11-01"),
        l.independence(),
        h("usek-christmas-2026", "إجازة الميلاد ورأس السنة", "Christmas and New Year break", "2026-12-23", "2027-01-02"),
        h("usek-epiphany-2027", "عيد الغطاس والميلاد عند الأرمن", "Epiphany and Armenian Christmas", "2027-01-06"),
        h("usek-st-anthony-2027", "عيد القديس أنطونيوس الكبير", "Saint Anthony the Great", "2027-01-17"),
        l.maroun(),
        l.hariri(),
        eidFitr("usek-eid-fitr-2027", "2027-03-09", "2027-03-10"),
        l.easter("2027-03-25", "2027-03-29"),
        h("usek-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-03"),
        eidAdha("usek-eid-adha-2027", "2027-05-16", "2027-05-17"),
        l.liberation(),
        hijriNewYear("usek-hijri-2027", "2027-06-06"),
        ashura("usek-ashura-2027", "2027-06-14"),
      ];
    })(),
  },
  "lebanese-american-university": {
    country: "LB", nameAr: "الجامعة اللبنانية الأمريكية", nameEn: "Lebanese American University",
    holidays: (() => {
      const l = LB("lau");
      return [
        l.independence("2026-11-22", "2026-11-23"),
        h("lau-christmas-2026", "عيد الميلاد المجيد", "Christmas", "2026-12-25"),
        newYear("lau-new-year-2027", "2027-01-01"),
        l.armenianChristmas(),
        l.maroun(),
        eidFitr("lau-eid-fitr-2027", "2027-03-09", "2027-03-10"),
        l.annunciation(),
        l.easter(),
        h("lau-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-03"),
        eidAdha("lau-eid-adha-2027", "2027-05-16", "2027-05-18"),
        h("lau-hijri-2027", "رأس السنة الهجرية", "Islamic New Year", "2027-06-06", "2027-06-07", true),
        h("lau-ashura-2027", "عاشوراء", "Ashura", "2027-06-15"),
        mawlid("lau-mawlid-2027", "2027-08-14"),
        l.assumption(),
      ];
    })(),
  },
  "antonine-university": {
    country: "LB", nameAr: "الجامعة الأنطونية", nameEn: "Antonine University",
    holidays: (() => {
      const l = LB("ua");
      return [
        h("ua-holy-cross-2026", "عيد الصليب", "Feast of the Holy Cross", "2026-09-14"),
        l.independence(),
        h("ua-christmas-2026", "إجازة الميلاد", "Christmas break", "2026-12-24", "2027-01-02"),
        l.armenianChristmas(),
        l.maroun(),
        l.hariri(),
        eidFitr("ua-eid-fitr-2027", "2027-03-10", "2027-03-11"),
        h("ua-easter-2027", "عيد البشارة والفصح (الكاثوليكي)", "Annunciation and Easter (Catholic)", "2027-03-25", "2027-03-29"),
        h("ua-orthodox-easter-2027", "عيد الفصح (الأرثوذكسي) وعيد العمال", "Easter (Orthodox) and Labour Day", "2027-04-30", "2027-05-03"),
        eidAdha("ua-eid-adha-2027", "2027-05-17", "2027-05-18"),
        l.liberation(),
        h("ua-ashura-2027", "عاشوراء", "Ashura", "2027-06-15"),
      ];
    })(),
  },
  "middle-east-university-lebanon": {
    country: "LB", nameAr: "جامعة الشرق الأوسط - لبنان", nameEn: "Middle East University (Lebanon)",
    holidays: (() => {
      const l = LB("meu-lb");
      return [
        l.independence(),
        h("meu-lb-christmas-2026", "عيد الميلاد المجيد", "Christmas", "2026-12-25"),
        newYear("meu-lb-new-year-2027", "2027-01-01"),
        l.armenianChristmas(),
        l.maroun(),
        l.hariri(true),
        eidFitr("meu-lb-eid-fitr-2027", "2027-03-09", "2027-03-10"),
        l.annunciation(),
        l.easter(),
        h("meu-lb-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-03"),
        eidAdha("meu-lb-eid-adha-2027", "2027-05-17", "2027-05-18"),
        hijriNewYear("meu-lb-hijri-2027", "2027-06-06"),
        ashura("meu-lb-ashura-2027", "2027-06-15"),
        h("meu-lb-assumption-2027", "عيد انتقال السيدة العذراء والمولد النبوي", "Assumption Day and Prophet's Birthday", "2027-08-15"),
      ];
    })(),
  },
  "haigazian-university": {
    country: "LB", nameAr: "جامعة هايكازيان", nameEn: "Haigazian University",
    holidays: (() => {
      const l = LB("hu");
      return [
        l.independence(),
        h("hu-christmas-2026", "عيد الميلاد المجيد", "Christmas", "2026-12-24", "2026-12-25"),
        h("hu-new-year-2026", "رأس السنة الميلادية", "New Year", "2026-12-31", "2027-01-01"),
        l.armenianChristmas("2027-01-07"),
        h("hu-vartanants-2027", "عيد فارتانانتس", "Vartanants Day", "2027-02-04"),
        l.maroun(),
        eidFitr("hu-eid-fitr-2027", "2027-03-10", "2027-03-11"),
        l.annunciation(),
        l.easter(),
        h("hu-genocide-2027", "ذكرى الإبادة الأرمنية", "Armenian Genocide Commemoration", "2027-04-24"),
        h("hu-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-03"),
        eidAdha("hu-eid-adha-2027", "2027-05-17", "2027-05-18"),
        h("hu-armenian-independence-2027", "عيد الاستقلال الأرمني", "Armenian Independence Day", "2027-05-28"),
        hijriNewYear("hu-hijri-2027", "2027-06-06"),
        ashura("hu-ashura-2027", "2027-06-15"),
        l.assumption(),
      ];
    })(),
  },
  "global-university-lebanon": {
    country: "LB", nameAr: "الجامعة العالمية (لبنان)", nameEn: "Global University (Lebanon)",
    holidays: (() => {
      const l = LB("gu-lb");
      return [
        l.independence(),
        h("gu-lb-winter-2026", "عطلة رسمية (الميلاد ورأس السنة)", "Official holiday (Christmas and New Year)", "2026-12-24", "2027-01-06"),
        l.maroun(),
        l.hariri(),
        h("gu-lb-ramadan-break-2027", "استراحة رمضان", "Ramadan break", "2027-03-04", "2027-03-08"),
        eidFitr("gu-lb-eid-fitr-2027", "2027-03-09", "2027-03-11"),
        l.annunciation(),
        h("gu-lb-easter-2027", "عيد الفصح (الغربي)", "Easter (Western)", "2027-03-26"),
        h("gu-lb-easter-monday-2027", "عطلة رسمية (الفصح)", "Official holiday (Easter)", "2027-03-29"),
        h("gu-lb-orthodox-easter-2027", "عيد الفصح (الشرقي) وعيد العمال", "Easter (Eastern) and Labour Day", "2027-04-30", "2027-05-01"),
        h("gu-lb-orthodox-easter-monday-2027", "عطلة رسمية (الفصح الشرقي)", "Official holiday (Eastern Easter)", "2027-05-03"),
        eidAdha("gu-lb-eid-adha-2027", "2027-05-16", "2027-05-19"),
        l.liberation(),
        hijriNewYear("gu-lb-hijri-2027", "2027-06-05"),
        ashura("gu-lb-ashura-2027", "2027-06-14"),
        mawlid("gu-lb-mawlid-2027", "2027-08-14"),
        l.assumption(),
      ];
    })(),
  },
};

/** A university whose own 2026-2027 calendar we've read: its holidays AND its
 *  own breaks (a mid-term break, a Christmas break), which the country's list
 *  leaves out. Keyed by the catalogue slug (lib/gradeCatalog) where it has one.
 *  A university whose calendar holds nothing beyond its country's list (Yarmouk,
 *  University of Bahrain, AU Kuwait, UAE University) needs no entry. The
 *  October 2026 audit's calendars (AUDITED_HOLIDAYS) are added at the end. Sources:
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
  ...AUDITED_HOLIDAYS,
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
