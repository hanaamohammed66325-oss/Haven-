-- Jazan attendance re-check (her request, 2026-09-26: sources reached her
-- saying Jazan's denial limit is 25%). Read first-hand on jazanu.edu.sa:
--   - Bachelor's, CURRENT: study regulation + executive rules, 1st edition 1444
--     (2022), executive rule of article 14: denied above 20% of all course
--     activities, or 10% of clinical activity, without an excuse the college
--     accepts; with one, up to 50% (article 15). The existing row stays.
--   - 25% (1): the 2nd edition 1440 (2018) of the same regulation, executive
--     rule of article 9 — superseded by the 1444 edition.
--   - 25% (2): the 1448 admission guide of the paid academic diplomas (Institute
--     of Research and Consulting Services) — those programs only. Added below
--     as a program rule, in review like every other rule.

update public.attendance_policies
   set note = note || ' | إعادة تحقق 2026-09-26: نسبة 25% موجودة في الطبعة الثانية 1440هـ من اللائحة (القاعدة التنفيذية للمادة التاسعة) وقد حلّت محلها طبعة 1444هـ (20%)، وفي دليل الدبلومات المدفوعة 1448هـ (خاص بها، مضاف كقاعدة برنامج).',
       updated_at = now()
 where university_slug = 'jazan' and scope = 'university';

insert into public.attendance_policies
  (university_slug, country, scope, scope_name, method, max_absence, excused_counts, effective, status, note, sources)
select 'jazan', 'SA', 'program', 'الدبلومات الأكاديمية المدفوعة (معهد البحوث والخدمات الاستشارية)', 'unspecified', 25, true,
       'دليل القبول لبرامج الدبلومات الأكاديمية المدفوعة 1448هـ', 'review',
       'خاص بالدبلومات المدفوعة؛ طلاب البكالوريوس على لائحة 1444هـ (20%، و10% للنشاط السريري).',
       jsonb_build_array(jsonb_build_object(
         'url', 'https://edugate.jazanu.edu.sa/jazan/files/diploma_prog.pdf',
         'quote', 'وألا تزيد نسبة الغياب عن 25% من إجمالي الفصل الدراسي وإلا سقط حقه في دخول الاختبار النهائي',
         'title', 'دليل القبول لبرامج الدبلومات الأكاديمية المدفوعة 1448هـ - جامعة جازان'))
 where not exists (select 1 from public.attendance_policies where university_slug = 'jazan' and scope = 'program');

-- Rollback:
--   delete from public.attendance_policies where university_slug = 'jazan' and scope = 'program';
--   (and strip the ' | إعادة تحقق 2026-09-26…' suffix from the university row's note)
