-- University facts — the single source of official per-university data
-- (term dates, finals, حرمان threshold, holidays) that every Haven system reads.
--
-- Researched from each university's OFFICIAL calendar and entered with its
-- source link. Nothing reaches students until an admin approves it in the admin
-- dashboard (University facts). Everyone can read verified rows; only admins write.
--
--   status  verified → shown to students as "from your university's official calendar"
--           review   → prepared, waiting for an admin to confirm against the source
--           rejected → thrown out by an admin
--
-- fact_key: term_start | term_end | finals_start | finals_end | denial_pct |
--           holiday:<YYYY-MM-DD start>
-- value:    dates {"date":"2026-08-23"} · denial {"pct":25} ·
--           holiday {"name_ar","name_en","start","end"}
-- sources:  [{"url","title","quote"}] — where the value comes from.

create table if not exists public.university_facts (
  id uuid primary key default gen_random_uuid(),
  university_slug text not null,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  term text not null check (term in ('first', 'second', 'summer')),
  fact_key text not null,
  value jsonb not null,
  status text not null default 'review' check (status in ('verified', 'review', 'rejected')),
  verified_via text check (verified_via in ('admin')),
  sources jsonb not null default '[]'::jsonb,
  note text,
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  unique (university_slug, academic_year, term, fact_key)
);

create index if not exists university_facts_slug_status
  on public.university_facts (university_slug, status);

alter table public.university_facts enable row level security;

drop policy if exists "verified facts are public" on public.university_facts;
create policy "verified facts are public" on public.university_facts
  for select to anon, authenticated
  using (status = 'verified');

drop policy if exists "admins read all facts" on public.university_facts;
create policy "admins read all facts" on public.university_facts
  for select to authenticated
  using (public.is_admin_current());

drop policy if exists "admins write facts" on public.university_facts;
create policy "admins write facts" on public.university_facts
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

-- ── Seed: Jazan University 2026-2027, from its official academic calendar
-- (التقويم الأكاديمي لجامعة جازان 1448/1449هـ, published by the university's
-- communications department, jazanu.edu.sa). Lands as `review` — an admin
-- confirms it against the PDF before students see it.
insert into public.university_facts
  (university_slug, academic_year, term, fact_key, value, status, verified_via, sources, note)
select 'jazan', '2026-2027', f.term, f.fact_key, f.value::jsonb, 'review', null,
  jsonb_build_array(jsonb_build_object(
    'url', 'https://www.jazanu.edu.sa',
    'title', 'التقويم الأكاديمي لجامعة جازان للعام الجامعي 1448/1449هـ (2026-2027)',
    'quote', f.quote)),
  'Read from the official calendar PDF'
from (values
  ('first',  'term_start',            '{"date":"2026-08-23"}', 'بداية الدراسة في الفصل الدراسي الأول: الأحد 1448/03/10هـ - 2026/08/23م'),
  ('first',  'term_end',              '{"date":"2027-01-07"}', 'نهاية الفصل الدراسي الأول: الخميس 1448/07/29هـ - 2027/01/07م'),
  ('first',  'finals_start',          '{"date":"2026-12-20"}', 'الاختبارات النهائية للفصل الدراسي الأول: الأحد 1448/07/11هـ - 2026/12/20م'),
  ('first',  'finals_end',            '{"date":"2027-01-06"}', 'الاختبارات النهائية للفصل الدراسي الأول: حتى الأربعاء 1448/07/28هـ - 2027/01/06م'),
  ('first',  'holiday:2026-09-23',    '{"name_ar":"إجازة اليوم الوطني","name_en":"National Day","start":"2026-09-23","end":"2026-09-26"}', 'إجازة اليوم الوطني: الأربعاء 2026/09/23م - السبت 2026/09/26م'),
  ('first',  'holiday:2026-11-20',    '{"name_ar":"إجازة منتصف الفصل الدراسي الأول (إجازة الخريف)","name_en":"Mid-term (fall) break","start":"2026-11-20","end":"2026-11-28"}', 'إجازة منتصف الفصل الدراسي الأول (إجازة الخريف): الجمعة 2026/11/20م - السبت 2026/11/28م'),
  ('second', 'term_start',            '{"date":"2027-01-17"}', 'بداية الدراسة في الفصل الدراسي الثاني: الأحد 1448/08/09هـ - 2027/01/17م'),
  ('second', 'term_end',              '{"date":"2027-06-17"}', 'نهاية الفصل الدراسي الثاني: الخميس 1449/01/12هـ - 2027/06/17م'),
  ('second', 'finals_start',          '{"date":"2027-05-30"}', 'الاختبارات النهائية للفصل الدراسي الثاني: الأحد 1448/12/24هـ - 2027/05/30م'),
  ('second', 'finals_end',            '{"date":"2027-06-16"}', 'الاختبارات النهائية للفصل الدراسي الثاني: حتى الأربعاء 1449/01/11هـ - 2027/06/16م'),
  ('second', 'holiday:2027-02-19',    '{"name_ar":"إجازة يوم التأسيس","name_en":"Founding Day","start":"2027-02-19","end":"2027-02-22"}', 'إجازة يوم التأسيس: الجمعة 2027/02/19م - الاثنين 2027/02/22م'),
  ('second', 'holiday:2027-02-26',    '{"name_ar":"إجازة عيد الفطر","name_en":"Eid al-Fitr break","start":"2027-02-26","end":"2027-03-13"}', 'إجازة عيد الفطر المبارك: الجمعة 2027/02/26م - السبت 2027/03/13م'),
  ('second', 'holiday:2027-05-07',    '{"name_ar":"إجازة عيد الأضحى","name_en":"Eid al-Adha break","start":"2027-05-07","end":"2027-05-22"}', 'إجازة عيد الأضحى المبارك: الجمعة 2027/05/07م - السبت 2027/05/22م')
) as f(term, fact_key, value, quote)
on conflict (university_slug, academic_year, term, fact_key) do nothing;
