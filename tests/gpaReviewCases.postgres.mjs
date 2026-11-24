import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const student = "1e111111-1111-4111-8111-111111111111";
const other = "2e222222-2222-4222-8222-222222222222";
const admin = "3e333333-3333-4333-8333-333333333333";
const termId = "55555555-5555-4555-8555-555555555555";
async function value(sql, params = []) { return (await db.query(sql, params)).rows[0]?.value; }
async function user(id) {
  await value("select set_config('test.uid', $1, false) as value", [id]);
}
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function denied(fn, error) { await assert.rejects(fn, error); checks++; }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    insert into auth.users values ('${student}','student@example.test'), ('${other}','other@example.test'), ('${admin}','admin@example.test');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
    create function public.is_admin_current() returns boolean language sql stable as $$ select auth.uid() = '${admin}'::uuid $$;
    create table public.semesters(id uuid primary key, user_id uuid not null references auth.users(id));
    insert into public.semesters values ('${termId}', '${student}');
    create table public.support_tickets (
      id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
      user_email text not null, subject text not null, category text check (category in ('account','login','subscription','payment','technical','general','other')),
      priority text check (priority in ('low','normal','high','urgent')), status text check (status in ('open','pending','resolved','closed')),
      first_message text, created_at timestamptz default now(), updated_at timestamptz default now(), resolved_at timestamptz, closed_at timestamptz
    );
    alter table public.support_tickets enable row level security;
    revoke all on public.support_tickets from public, anon, authenticated;
    insert into public.support_tickets (user_email, subject, category, priority, status) values ('ordinary@example.test', 'Existing support request', 'general', 'normal', 'open');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261120110553_gpa_review_cases.sql", import.meta.url), "utf8"));
  const results = { semester: { ours: "3.84", portal: "3.75" }, cumulative: { ours: "3.80", portal: "3.72" } };
  const input = { source: "current", termId, label: "Term 1", scheme: "custom", max: 4, reason: "notCounted", details: { courses: [{ grade: "A" }] }, submissionId: "local-test-first", results };
  const save = (snapshot, create = true, revision = null) => value("select public.save_gpa_review_case($1,$2,$3) as value", [JSON.stringify(snapshot),create,revision]);
  const mine = () => value("select public.my_gpa_review_cases() as value");
  const queue = (include = true) => value("select public.admin_gpa_review_cases($1) as value", [include]);
  const change = (id, action, revision, evidence = null) => value("select public.admin_update_gpa_review_case($1,$2,$3,$4) as value", [id,action,revision,evidence]);
  await db.exec("set role anon");
  await denied(mine, /permission denied/);
  await denied(() => save(input), /permission denied/);
  await db.exec("set role authenticated");
  await user(student);
  await denied(() => queue(), /not_authorized/);
  await denied(() => value("select * from public.gpa_review_cases"), /permission denied/);
  await denied(() => save({ ...input, results: { semester: { ours: "3.84", portal: "3.84" } } }), /unconfirmed_difference/);
  await denied(() => save({ ...input, results: { semester: { ours: "9.99", portal: "3.84" } } }), /invalid_comparison/);
  const receipt = await save(input);
  check(receipt.status,"open");
  check(receipt.revision,1);
  check(await save(input),receipt);
  check((await mine()).map(x=>x.id),[receipt.id]);
  check(Object.keys((await mine())[0]).sort(),["id","label","resolution","revision","source","status","termId"]);
  await user(other);
  check(await mine(),[]);
  await denied(() => save(input), /unknown_term/);
  await denied(() => change(receipt.id,"triage",1), /not_authorized/);
  await user(admin);
  check(await queue(false),{newGpa:1,newSupport:2,cases:[]});
  check((await queue()).cases[0].email,"student@example.test");
  check((await queue()).cases[0].details.initialResults,results);
  await change(receipt.id,"triage",1);
  check((await queue()).newGpa,0);
  await denied(() => change(receipt.id,"resolve",2,{results,resolution:"No matching evidence"}),/resolution_requires_match/);
  await denied(() => change(receipt.id,"contact",1),/review_changed/);
  await change(receipt.id,"contact",2);
  check(Boolean((await queue()).cases[0].contactedAt),true);
  await user(student);
  const termMatch = { ...input, results: { semester: { ours: "3.75", portal: "3.75" } } };
  check(await save(termMatch,false,2),null);
  const partial = await save(termMatch,false,3);
  check(partial.status,"pending");
  const cumMatch = { ...input, results: { cumulative: { ours: "3.72", portal: "3.72" } } };
  check((await save(cumMatch,false,4)).status,"resolved");
  check((await save(input)).status,"resolved");
  const next = await save({...input,submissionId:"local-test-second"});
  check(next.id,receipt.id);
  check(next.status,"open");
  const past = await save({...input,source:"past",termId:"past-1",submissionId:"local-test-third"});
  check(past.id === receipt.id,false);
  await user(admin);
  await change(past.id,"resolve",1,{results:{...termMatch.results,...cumMatch.results},resolution:"تحققت المقارنة بعد تصحيح الساعات."});
  check((await queue()).cases.find(row=>row.id===past.id).status,"resolved");
  await db.exec("reset role");
  check(await value("select count(*)::int as value from public.support_tickets where priority='high' and category='gpa'"),2);

  await db.exec(await readFile(new URL("../supabase/migrations/20261120153000_gpa_review_workspace.sql", import.meta.url), "utf8"));
  await db.exec("set role authenticated");
  await user(student);
  check((await mine()).find((row) => row.id === past.id).status, "resolved");
  await denied(() => value("select public.save_gpa_review_case_v1('{}', true, null) as value"), /permission denied/);
  await denied(() => value("select * from public.gpa_review_case_actions"), /permission denied/);
  const complete = { ...input, termId: "detailed-past", source: "past", submissionId: "workspace-review-1", details: {
    confirmation: true, prior: { gpa: 0, hours: 0 }, selectedCourse: "x",
    grading: { id: "custom", max: 4, bands: [{ letter: "A", min: 85, points: 4 }, { letter: "F", min: 0, points: 0 }] },
    courseTable: [{ id: "x", name: "Calculus", hours: 2.5, grade: "A", points: 4, excluded: false }],
  } };
  await denied(() => save({ ...complete, label: "" }), /missing_gpa_request_fields/);
  await denied(() => save({ ...complete, details: { ...complete.details, confirmation: false } }), /missing_gpa_request_fields/);
  await denied(() => save({ ...complete, details: { ...complete.details, courseTable: [] } }), /missing_gpa_request_fields/);
  await denied(() => save({ ...complete, details: { ...complete.details, selectedCourse: null } }), /missing_gpa_request_selected_course/);
  await denied(() => save({ ...complete, details: { ...complete.details, prior: { gpa: 3, hours: 0 } } }), /missing_gpa_request_prior/);
  const working = await save(complete);
  check((await mine()).find((row) => row.id === working.id).affectedKinds, ["cumulative", "semester"]);
  check(await save(complete), working);
  await user(other);
  check((await mine()).some((row) => row.id === working.id), false);
  await denied(() => change(working.id, "note", 1, { note: "Private", classification: "app" }), /not_authorized/);
  await user(admin);
  await change(working.id, "triage", 1);
  await change(working.id, "note", 2, { note: "Credit correction tested", classification: "inputs" });
  await change(working.id, "wait", 3, { note: "Asked for excluded course details" });
  let adminRow = (await queue()).cases.find((row) => row.id === working.id);
  check(adminRow.classification, "inputs");
  check(adminRow.status, "waiting");
  check(adminRow.timeline.map((entry) => entry.action), ["submitted", "triage", "note", "wait"]);
  check(adminRow.timeline[2].actor, "admin@example.test");
  await user(student);
  const own = (await mine()).find((row) => row.id === working.id);
  check(own.status, "waiting");
  check("timeline" in own, false);
  check("classification" in own, false);
  await user(admin);
  await change(working.id, "triage", 4);
  await denied(() => change(working.id, "resolve", 5, { results: termMatch.results, resolution: "Partial" }), /resolution_requires_match/);
  await change(working.id, "resolve", 5, { results: { ...termMatch.results, ...cumMatch.results }, resolution: "Verified after correcting credits." });
  await change(working.id, "reopen", 6, { note: "A new comparison needs verification" });
  adminRow = (await queue()).cases.find((row) => row.id === working.id);
  check(adminRow.status, "pending");
  check(adminRow.timeline.at(-1).action, "reopen");
  check(adminRow.details.initialResults, results);
  await db.exec("reset role");
  console.log(`PASS ${checks} PostgreSQL review checks`);
} finally { await db.close(); }
