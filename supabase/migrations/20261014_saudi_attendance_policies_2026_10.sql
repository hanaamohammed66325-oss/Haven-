-- Saudi attendance rules confirmed by both research agents (blind protocol,
-- October 2026), from each university's own regulation. Only rules the two
-- agents agree on are applied; anything one agent found alone, or whose source
-- is unreachable / scoped to one college, is NOT here (Taibah's mixed 25% /
-- 40% boundaries, Yamamah whose V8.0 policy of 1 July 2026 is already on
-- record, Hail, Effat, Naif, Bisha, Shaqra, KSAU-HS, KAUST ...).
--
-- Students with a changed rule are asked again to confirm it, because the
-- confirmation key follows the rule (policyRuleKey in lib/attendancePolicy).

-- Fill the university rows that exist with no numbers ---------------------------------

update public.attendance_policies
   set method = 'hours', max_absence = 25, max_unexcused = 25, excused_counts = false,
       excuse_floor_attendance = 50, separate_components = false,
       effective = '1444/05/11 regulation (file uploaded 2023-11)',
       sources = jsonb_build_array(jsonb_build_object(
         'url', 'https://www.mu.edu.sa/en/deanships/deanship-of-admission-and-registration/1712',
         'title', 'لائحة الدراسة والاختبارات للمرحلة الجامعية وقواعدها التنفيذية - جامعة المجمعة (1444/05/11هـ)',
         'quote', 'يحرم الطالب من دخول الاختبار النهائي للمقرر إذا زادت نسبة غيابه عن (25%) خمس وعشرين في المائة، بدون عذر من مجموع ساعات الاتصال للمحاضرات والدروس العملية والسريرية الفعلية والتمارين المحددة للمقرر ... على ألا تقل نسبة الحضور عن (50%)')),
       note = 'المادة 14 (القاعدة 2) والمادة 15: 25% غياب بدون عذر من ساعات الاتصال؛ مع العذر المقبول يرفع مجلس الكلية الحرمان ما دام الحضور لا يقل عن 50%. مؤكدة من الباحثين بشكل مستقل.',
       status = 'verified', last_verified = now(), updated_at = now()
 where university_slug = 'majmaah' and scope = 'university';

update public.attendance_policies
   set method = 'hours', max_absence = 25, max_unexcused = 25, excused_counts = false,
       excuse_floor_attendance = 50, separate_components = false,
       effective = 'Study and Examination Regulations 1447 (Sept 2025)',
       sources = jsonb_build_array(jsonb_build_object(
         'url', 'https://portal.bu.edu.sa/documents/170723/0/Study+and+Examination+Regulations+1447.pdf',
         'title', 'لائحة الدراسة والاختبارات - جامعة الباحة (1447)',
         'quote', 'يحرم الطالب من دخول الاختبار النهائي للمقرر إذا زادت نسبة غيابه دون عذر عن 25٪ من مجموع ساعات اتصال المقرر وفق الخطة الدراسية ... لا يسمح للطالب بدخول الاختبار النهائي في المقرر إذا كانت نسبة الحضور فيه أقل من (50%)')),
       note = 'المادة 14 و15 (القاعدة 1): 25% غياب بدون عذر من ساعات الاتصال؛ ولا يدخل الاختبار إذا قل الحضور عن 50% مهما كان العذر. هذا لائحة البكالوريوس، وقاعدة الدبلومات (كلية التعليم التطبيقي) تبقى صفًا مستقلًا.',
       status = 'verified', last_verified = now(), updated_at = now()
 where university_slug = 'bahah' and scope = 'university';

update public.attendance_policies
   set max_absence = 20, excused_counts = true, excuse_floor_attendance = 50,
       effective = 'Executive rules 1444 (Regulatory_rules_1444)',
       sources = jsonb_build_array(jsonb_build_object(
         'url', 'https://units.imamu.edu.sa/deanships/admission/Documents/Regulatory_rules_1444.pdf',
         'title', 'القواعد التنفيذية للائحة الدراسة والاختبارات للمرحلة الجامعية - جامعة الإمام محمد بن سعود الإسلامية (1444)',
         'quote', 'يُحرم الطالب من الاستمرار في الدراسة ودخول الاختبار النهائي في المقرر الذي تقل نسبة حضوره فيه عن (80%) من الوحدات الدراسية ... لا يُسمح للطالب بدخول الاختبار النهائي في المقرر إذا قلت نسبة حضوره فيه عن (50%) مهما كانت الأعذار')),
       note = 'القواعد التنفيذية 1444 (المادة 14 والمادة 15): الحضور أقل من 80% يعني حرمانًا، أي غياب فوق 20%؛ ولا دخول إذا قل الحضور عن 50% مهما كانت الأعذار. اللائحة لا تنص على هل يُحسب الغياب بعذر أم لا، فتبقى القاعدة على الغياب الكلي. كلية الاقتصاد والعلوم الإدارية تطبق 20% بدون عذر (في details).',
       updated_at = now()
 where university_slug = 'imam' and scope = 'university';

update public.attendance_policies
   set max_absence = 25, max_unexcused = 25, excused_counts = false, excuse_floor_attendance = 50,
       effective = 'Study and Examination Bylaws 2021 (Art. 9-10) + DAU Policy Manual 2024',
       sources = jsonb_build_array(
         jsonb_build_object(
           'url', 'https://dau.edu.sa/wp-content/uploads/sites/5/2021/02/Study-and-Examination-Bylaws-and-DAU-Implementation-Rules.pdf',
           'title', 'Study and Examination Bylaws and DAU Implementation Rules (2021)',
           'quote', 'will be given a DN grade if his unexcused absences are more than 25% of the lecture and laboratory sessions scheduled for the course ... the minimum attendance requirement is not less than 50% of the lecture and laboratory sessions scheduled for the course'),
         jsonb_build_object(
           'url', 'https://dau.edu.sa/wp-content/uploads/2024/11/DAU_Policy-and-Procedure-Manual.pdf',
           'title', 'DAU Policy and Procedure Manual (2024)',
           'quote', 'An absence exceeding 50% will result in a "DN" without any possibility of removal.')),
       note = 'لائحة 2021 (المادة 9 وقواعدها التنفيذية، والمادة 10): DN إذا زاد الغياب بدون عذر عن 25%؛ ويرفع مجلس الكلية الحرمان بعذر مقبول ما دام الحضور لا يقل عن 50%. دليل السياسات 2024 يؤكد حد 50% بصياغة أقل دقة. تحل محل لائحة 2015 المسجلة سابقًا.',
       status = 'verified', last_verified = now(), updated_at = now()
 where university_slug = 'dar-aluloom' and scope = 'university';

update public.attendance_policies
   set method = 'hours', max_absence = 35, max_unexcused = 20, excused_counts = true,
       excuse_floor_attendance = 65, separate_components = false,
       effective = 'Muharram 1446 / July 2024 (file uploaded 2026-01)',
       sources = jsonb_build_array(jsonb_build_object(
         'url', 'https://www.ut.edu.sa/sites/default/files/2026-01/layht_aldrast_walakhtbarat.pdf',
         'title', 'لائحة الدراسة والاختبارات للمرحلة الجامعية والقواعد التنفيذية - جامعة تبوك (محرم 1446هـ)',
         'quote', 'يحرم الطالب من دخول الاختبار النهائي إذا تجاوزت نسبة غيابه بدون عذر 20% من مجموع ساعات الاتصال ... أو تجاوزت نسبة إجمالي غيابه (بعذر وبدون عذر) 35% من مجموع ساعات الاتصال')),
       note = 'المادتان 14 و15 (القاعدة التنفيذية): حرمان إذا تجاوز الغياب بدون عذر 20%، أو تجاوز إجمالي الغياب (بعذر وبدون) 35%؛ ويرفع مجلس الكلية الحرمان بعذر مقبول ما دام إجمالي الغياب لا يزيد عن 35%.',
       status = 'verified', last_verified = now(), updated_at = now()
 where university_slug = 'tabuk' and scope = 'university';

-- Jazan: the 1444 rule was already on record in review; both agents confirm it ----------

update public.attendance_policies
   set status = 'verified', last_verified = now(), updated_at = now()
 where university_slug = 'jazan' and scope = 'university' and scope_name is null and status = 'review';

-- New rows ------------------------------------------------------------------------------

insert into public.attendance_policies
  (university_slug, university_name, country, scope, method, max_absence, max_unexcused, excused_counts,
   excuse_floor_attendance, separate_components, warnings, details, effective, status, note, sources, last_verified)
select 'hafr-albatin', 'جامعة حفر الباطن', 'SA', 'university', 'hours', 25, 25, false, 66.67, true,
       '[8.33, 16.66]'::jsonb, '{"limit_inclusive": true}'::jsonb,
       'Regulation 1444 (Nov 2022; file re-uploaded 2026-08)', 'verified',
       'الغياب بدون عذر 25% فأعلى (يبلغ الحد) يعني حرمانًا؛ ومع العذر القهري أو الطبي يرفع مجلس الكلية الحرمان ما دام الحضور لا يقل عن الثلثين (غياب حتى 33.33%)، وعند 33.33% يصير الحرمان نهائيًا. الجدول يعدّ النظري والعملي كل لحاله.',
       jsonb_build_array(jsonb_build_object(
         'url', 'https://www.uhb.edu.sa/sites/default/files/2026-08/%D8%A7%D9%84%D8%AF%D8%B1%D8%A7%D8%B3%D8%A9%20%20%D9%88%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1%D8%A7%D8%AA%201444%D9%87%D9%80l.pdf',
         'title', 'لائحة الدراسة والاختبارات للمرحلة الجامعية والقواعد التنفيذية - جامعة حفر الباطن (1444هـ)',
         'quote', 'إذا بلغت نسبة غياب الطالب في المقرر دون عذر 25% فأعلى من المحاضرات والدروس العملية المحددة للمقرر، لا يحق له دخول الاختبار النهائي ويرصد له في سجله الأكاديمي تقدير محروم (ح) أو (DN) في المقرر')),
       now()
 where not exists (select 1 from public.attendance_policies where university_slug = 'hafr-albatin' and scope = 'university');

insert into public.attendance_policies
  (university_slug, university_name, country, scope, method, max_absence, excused_counts,
   excuse_floor_attendance, separate_components, effective, status, note, sources, last_verified)
select 'najran', 'جامعة نجران', 'SA', 'university', 'lectures', 25, true, 50, false,
       'Edition 3 (15/5/1445)', 'verified',
       'الحضور أقل من 75% يعني حرمانًا من المقرر والاختبار؛ ويرفع مجلس الكلية الحرمان بعذر مقبول مقدَّم قبل الاختبارات النهائية ما دام الحضور لا يقل عن 50%. اللائحة لا تنص صراحة على احتساب الغياب بعذر.',
       jsonb_build_array(jsonb_build_object(
         'url', 'https://www.nu.edu.sa/documents/145314670/0/%D9%84%D8%A7%D9%8A%3F%D8%AD%D8%A9+%D8%A7%D9%84%D8%AF%D8%B1%D8%A7%D8%B3%D8%A9+%D9%88%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1%D8%A7%D8%AA+%D8%A7%D9%84%D8%AC%D8%AF%D9%8A%D8%AF%D8%A9_.pdf/9c7b91fe-5e1d-96bb-f78a-32db51812a82?t=1759825935231',
         'title', 'لائحة الدراسة والاختبارات للمرحلة الجامعية والقواعد التنفيذية - جامعة نجران (الإصدار 3، 15/5/1445هـ)',
         'quote', 'ويحرم من دراسة المقرر ودخول الاختبار النهائي إذا قلت نسبة حضوره عن 75% وفقًا لأنماط التعليم المحددة في الخطة الدراسية')),
       now()
 where not exists (select 1 from public.attendance_policies where university_slug = 'najran' and scope = 'university');

insert into public.attendance_policies
  (university_slug, university_name, country, scope, scope_name, method, max_absence, excused_counts,
   excuse_floor_attendance, effective, status, note, sources, last_verified)
select 'riyadh-elm', 'جامعة رياض العلم', 'SA', 'program', 'التعليم الإلكتروني (عن بعد)', 'hours', 25, true, 50,
       'Undated e-learning policy page', 'verified',
       'خاص بالدراسة الإلكترونية: الحضور أقل من 75% من ساعات الاتصال الكلية يعني حرمانًا من الاختبار النهائي؛ ويرفع مجلس الكلية الحرمان بعذر مقبول ما دام الحضور لا يقل عن 50%. لا تنطبق على الدراسة الحضورية؛ ولم تُنشر لها لائحة عامة.',
       jsonb_build_array(jsonb_build_object(
         'url', 'https://elearning.riyadh.edu.sa/policy/',
         'title', 'REU eLearning Attendance and Absenteeism Policy',
         'quote', 'subjected to be denied of entering the final examination if his/her attendance rate is less than (75%) of the total contact hours for all course activities ... provided that the attendance rate of lectures is not less than (50%) out of the total contact hours for the course')),
       now()
 where not exists (select 1 from public.attendance_policies where university_slug = 'riyadh-elm' and scope = 'program');

insert into public.attendance_policies
  (university_slug, university_name, country, scope, method, excused_counts, details, effective, status, note, sources, last_verified)
select 'prince-sultan', 'جامعة الأمير سلطان', 'SA', 'university', 'count', true,
       jsonb_build_object(
         'limit_inclusive', true,
         'table', jsonb_build_array(
           jsonb_build_object('weekly_hours', 2, 'first_warning', 3, 'second_warning', 6, 'dn', 8),
           jsonb_build_object('weekly_hours', 3, 'first_warning', 5, 'second_warning', 9, 'dn', 12),
           jsonb_build_object('weekly_hours', 4, 'first_warning', 6, 'second_warning', 11, 'dn', 16),
           jsonb_build_object('weekly_hours', 6, 'first_warning', 9, 'second_warning', 16, 'dn', 23),
           jsonb_build_object('weekly_hours', 7, 'first_warning', 11, 'second_warning', 18, 'dn', 27),
           jsonb_build_object('weekly_hours', 8, 'first_warning', 12, 'second_warning', 22, 'dn', 30),
           jsonb_build_object('weekly_hours', 10, 'first_warning', 15, 'second_warning', 27, 'dn', 39, 'note', 'not Preparatory English'),
           jsonb_build_object('weekly_hours', 'Preparatory English', 'first_warning', 10, 'second_warning', 15, 'dn', 23))),
       'Rules of Implementation 1446H / 2025 (also 1447H / 2026)', 'verified',
       'يُحسب الحرمان بعدد ساعات الغياب (بعذر وبدون عذر) حسب عدد الساعات الأسبوعية للمقرر، وليس بنسبة؛ ويكفي بلوغ العدد المذكور (أو أكثر). الجدول الكامل في details.table. لا يُحسب تلقائيًا في التطبيق.',
       jsonb_build_array(jsonb_build_object(
         'url', 'https://www.psu.edu.sa/storage/media/2025/8/11/OnxqRzjrsX8IEkgTbUzh4u9vGYcABlB2K7sVlRyy.pdf',
         'title', 'Prince Sultan University - Rules of Implementation of the Undergraduate Study and Examinations By-Law (Art. 14)',
         'quote', 'If a student''s absences (excused or unexcused) exceed the allowed limit for a course, the student will be barred from continuing the course, denied entrance to the respective final examination, and given the grade (DN) in the course')),
       now()
 where not exists (select 1 from public.attendance_policies where university_slug = 'prince-sultan' and scope = 'university');

-- Rollback (the changed rows keep their earlier text in git history of this file's parent
-- migrations; the new rows can be removed with):
--   delete from public.attendance_policies
--    where (university_slug, scope) in (('hafr-albatin','university'), ('najran','university'),
--          ('riyadh-elm','program'), ('prince-sultan','university'));
--   and restore the five updated rows (majmaah, bahah, imam, dar-aluloom, tabuk) and
--   jazan (status back to 'review') from the pre-migration copy saved in
--   research/gpa-calendar-audit/SAUDI_ATTENDANCE_BEFORE.json.
