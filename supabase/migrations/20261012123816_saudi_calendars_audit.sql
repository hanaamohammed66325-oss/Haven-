-- Saudi AY2026-27 calendars from the October 2026 audit (research/gpa-calendar-audit:
-- TRANSFER_LIST_ALL_COUNTRIES.md section A; Claude's records in claude/<slug>.md, each
-- read from the university's own calendar). Approved by Hanaa on 2026-10-12.
--
--   king-abdulaziz   ADD second term (its Eid al-Adha break starts 30 Apr, not 7 May)
--   bisha            ADD finals and holidays (Fitr break starts after Thu 18 Feb), second term
--   islamic-madinah  REPLACE the suggested rows with the verified calendar (no November
--                    break; Adha from 11 May)
--   king-khalid      FIX second term: its Eid al-Adha break was missing, so a student on its
--                    calendar lost that deduction
--   ubt, kaust, prince-fahd-sultan  ADD both terms (none on record)
--
-- Held, nothing changes: Umm Al-Qura (second-term Adha conflict), Arab Open (term start
-- check). Convention as the rows already on record: a break the calendar says "starts
-- Thursday" (the last class day) is stored from the Friday, to the day before classes resume.

with src(slug, url, title) as (values
  ('king-abdulaziz', 'https://kau.edu.sa/ar/academic-calendar', 'التقويم الأكاديمي للعام الجامعي 1448/1449 هـ — جامعة الملك عبدالعزيز'),
  ('bisha', 'https://www.ub.edu.sa/ar/academic-calendar', 'التقويم الجامعي — جامعة بيشة'),
  ('islamic-madinah', 'https://iu.edu.sa/announ14480112', 'التقويم الأكاديمي للعام الجامعي 1448-1449هـ — الجامعة الإسلامية'),
  ('king-khalid', 'https://www.kku.edu.sa/en/portfolio/academic-calendar', 'Academic calendar 1448/1449 — King Khalid University'),
  ('ubt', 'https://www.ubt.edu.sa/files/academiccalendars/6956b854-ece6-40f8-afc8-4dae1d78b34f.pdf', 'Academic Calendar Fall 2026 — UBT'),
  ('ubt-s2', 'https://www.ubt.edu.sa/files/academiccalendars/a2d04525-bee1-4dbd-a317-6de1062499f8.pdf', 'Academic Calendar Spring 2027 — UBT'),
  ('kaust', 'https://registrar.kaust.edu.sa/docs/default-source/academic-calendar/academic-calendar-2026-2027_t4-(6).pdf', '2026-2027 Academic Calendar — KAUST'),
  ('prince-fahd-sultan', 'https://fbsu.edu.sa/PDF/FBSU_Academic_Calendar_2026-2027.pdf', 'Academic calendar 2026-2027 — Fahd Bin Sultan University')
),
rows(slug, src_key, term, fact_key, value) as (values
  -- King Abdulaziz, second term
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'term_start', '{"date":"2027-01-17"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'holiday:2027-02-21', '{"start":"2027-02-21","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'holiday:2027-02-26', '{"start":"2027-02-26","end":"2027-03-13","name_ar":"إجازة عيد الفطر","name_en":"Eid al-Fitr break"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'holiday:2027-04-30', '{"start":"2027-04-30","end":"2027-05-22","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'finals_start', '{"date":"2027-06-06"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'finals_end', '{"date":"2027-06-24"}'),
  ('king-abdulaziz', 'king-abdulaziz', 'second', 'term_end', '{"date":"2027-07-01"}'),
  -- Bisha (first-term start and end are on record)
  ('bisha', 'bisha', 'first', 'holiday:2026-09-23', '{"start":"2026-09-23","end":"2026-09-24","name_ar":"إجازة اليوم الوطني","name_en":"National Day"}'),
  ('bisha', 'bisha', 'first', 'holiday:2026-11-20', '{"start":"2026-11-20","end":"2026-11-28","name_ar":"إجازة الخريف","name_en":"Fall break"}'),
  ('bisha', 'bisha', 'first', 'finals_start', '{"date":"2026-12-20"}'),
  ('bisha', 'bisha', 'first', 'finals_end', '{"date":"2027-01-07"}'),
  ('bisha', 'bisha', 'second', 'term_start', '{"date":"2027-01-17"}'),
  ('bisha', 'bisha', 'second', 'holiday:2027-02-19', '{"start":"2027-02-19","end":"2027-03-13","name_ar":"إجازة عيد الفطر","name_en":"Eid al-Fitr break"}'),
  ('bisha', 'bisha', 'second', 'holiday:2027-02-21', '{"start":"2027-02-21","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('bisha', 'bisha', 'second', 'holiday:2027-05-07', '{"start":"2027-05-07","end":"2027-05-22","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  ('bisha', 'bisha', 'second', 'finals_start', '{"date":"2027-06-06"}'),
  ('bisha', 'bisha', 'second', 'finals_end', '{"date":"2027-06-17"}'),
  ('bisha', 'bisha', 'second', 'term_end', '{"date":"2027-06-17"}'),
  -- Islamic University of Madinah (replaces the suggested rows)
  ('islamic-madinah', 'islamic-madinah', 'first', 'term_start', '{"date":"2026-08-16"}'),
  ('islamic-madinah', 'islamic-madinah', 'first', 'holiday:2026-09-23', '{"start":"2026-09-23","end":"2026-09-26","name_ar":"إجازة اليوم الوطني","name_en":"National Day"}'),
  ('islamic-madinah', 'islamic-madinah', 'first', 'finals_start', '{"date":"2026-11-29"}'),
  ('islamic-madinah', 'islamic-madinah', 'first', 'finals_end', '{"date":"2026-12-15"}'),
  ('islamic-madinah', 'islamic-madinah', 'first', 'term_end', '{"date":"2026-12-15"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'term_start', '{"date":"2026-12-20"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'holiday:2027-01-08', '{"start":"2027-01-08","end":"2027-01-16","name_ar":"إجازة الشتاء","name_en":"Winter break"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'holiday:2027-02-19', '{"start":"2027-02-19","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'holiday:2027-02-26', '{"start":"2027-02-26","end":"2027-03-13","name_ar":"إجازة عيد الفطر","name_en":"Eid al-Fitr break"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'finals_start', '{"date":"2027-04-25"}'),
  ('islamic-madinah', 'islamic-madinah', 'second', 'holiday:2027-05-11', '{"start":"2027-05-11","end":"2027-05-22","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  -- King Khalid, the missing second-term Adha break
  ('king-khalid', 'king-khalid', 'second', 'holiday:2027-05-07', '{"start":"2027-05-07","end":"2027-05-22","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  -- UBT
  ('ubt', 'ubt', 'first', 'term_start', '{"date":"2026-09-06"}'),
  ('ubt', 'ubt', 'first', 'holiday:2026-09-23', '{"start":"2026-09-23","end":"2026-09-24","name_ar":"إجازة اليوم الوطني","name_en":"National Day"}'),
  ('ubt', 'ubt', 'first', 'holiday:2026-11-25', '{"start":"2026-11-25","end":"2026-11-26","name_ar":"إجازة نهاية أسبوع طويلة","name_en":"Long weekend"}'),
  ('ubt', 'ubt', 'first', 'finals_start', '{"date":"2026-12-19"}'),
  ('ubt', 'ubt', 'first', 'finals_end', '{"date":"2027-01-02"}'),
  ('ubt', 'ubt', 'first', 'term_end', '{"date":"2027-01-02"}'),
  ('ubt', 'ubt-s2', 'second', 'term_start', '{"date":"2027-01-17"}'),
  ('ubt', 'ubt-s2', 'second', 'holiday:2027-02-21', '{"start":"2027-02-21","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('ubt', 'ubt-s2', 'second', 'holiday:2027-02-23', '{"start":"2027-02-23","end":"2027-03-13","name_ar":"إجازة رمضان وعيد الفطر","name_en":"Ramadan and Eid al-Fitr break"}'),
  ('ubt', 'ubt-s2', 'second', 'holiday:2027-05-14', '{"start":"2027-05-14","end":"2027-05-22","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  ('ubt', 'ubt-s2', 'second', 'finals_start', '{"date":"2027-05-29"}'),
  ('ubt', 'ubt-s2', 'second', 'finals_end', '{"date":"2027-06-12"}'),
  ('ubt', 'ubt-s2', 'second', 'term_end', '{"date":"2027-06-12"}'),
  -- KAUST (Eid al-Adha falls after the spring exams)
  ('kaust', 'kaust', 'first', 'term_start', '{"date":"2026-08-30"}'),
  ('kaust', 'kaust', 'first', 'holiday:2026-09-23', '{"start":"2026-09-23","end":"2026-09-24","name_ar":"إجازة اليوم الوطني","name_en":"National Day"}'),
  ('kaust', 'kaust', 'first', 'holiday:2026-10-18', '{"start":"2026-10-18","end":"2026-10-19","name_ar":"إجازة منتصف الفصل","name_en":"Mid-semester break"}'),
  ('kaust', 'kaust', 'first', 'finals_start', '{"date":"2026-12-13"}'),
  ('kaust', 'kaust', 'first', 'finals_end', '{"date":"2026-12-16"}'),
  ('kaust', 'kaust', 'first', 'term_end', '{"date":"2026-12-16"}'),
  ('kaust', 'kaust', 'second', 'term_start', '{"date":"2027-01-17"}'),
  ('kaust', 'kaust', 'second', 'holiday:2027-02-21', '{"start":"2027-02-21","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('kaust', 'kaust', 'second', 'holiday:2027-03-03', '{"start":"2027-03-03","end":"2027-03-04","name_ar":"إجازة منتصف الفصل","name_en":"Mid-semester break"}'),
  ('kaust', 'kaust', 'second', 'holiday:2027-03-07', '{"start":"2027-03-07","end":"2027-03-11","name_ar":"إجازة عيد الفطر","name_en":"Eid al-Fitr break"}'),
  ('kaust', 'kaust', 'second', 'finals_start', '{"date":"2027-05-09"}'),
  ('kaust', 'kaust', 'second', 'finals_end', '{"date":"2027-05-12"}'),
  ('kaust', 'kaust', 'second', 'term_end', '{"date":"2027-05-12"}'),
  -- Fahd Bin Sultan
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'term_start', '{"date":"2026-08-30"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'holiday:2026-09-23', '{"start":"2026-09-23","end":"2026-09-24","name_ar":"إجازة اليوم الوطني","name_en":"National Day"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'holiday:2026-11-22', '{"start":"2026-11-22","end":"2026-11-26","name_ar":"إجازة الخريف","name_en":"Fall break"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'finals_start', '{"date":"2026-12-27"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'finals_end', '{"date":"2027-01-07"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'first', 'term_end', '{"date":"2027-01-07"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'term_start', '{"date":"2027-01-17"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'holiday:2027-02-21', '{"start":"2027-02-21","end":"2027-02-22","name_ar":"إجازة يوم التأسيس","name_en":"Founding Day"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'holiday:2027-02-23', '{"start":"2027-02-23","end":"2027-03-13","name_ar":"إجازة الشتاء وعيد الفطر","name_en":"Winter break and Eid al-Fitr"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'holiday:2027-05-12', '{"start":"2027-05-12","end":"2027-05-20","name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'finals_start', '{"date":"2027-06-06"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'finals_end', '{"date":"2027-06-20"}'),
  ('prince-fahd-sultan', 'prince-fahd-sultan', 'second', 'term_end', '{"date":"2027-06-20"}')
)
insert into public.university_facts (university_slug, academic_year, term, fact_key, value, status, verified_via, sources, note, updated_at)
select r.slug, '2026-2027', r.term, r.fact_key, r.value::jsonb, 'verified', 'admin',
       jsonb_build_array(jsonb_build_object('url', s.url, 'title', s.title)),
       'October 2026 audit (Claude, from the official calendar; approved by Hanaa 2026-10-12).', now()
from rows r join src s on s.slug = r.src_key
on conflict (university_slug, academic_year, term, fact_key) do update
  set value = excluded.value, status = 'verified', verified_via = 'admin', sources = excluded.sources,
      note = excluded.note, updated_at = now();

-- Islamic Madinah's suggested rows the verified calendar doesn't keep (none expected; the
-- two suggested finals rows above were overwritten in place).
delete from public.university_facts
where university_slug = 'islamic-madinah' and academic_year = '2026-2027' and status = 'suggested';
