import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { SAUDI4, SAUDI5, SPECIAL_RESULTS, resolveScheme } from "@/lib/gradeSchemes";
import { gpaReviewId, captureGpaSystem, readGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey, legacyReferenceBeforeChange, heldPreviousGpa } from "@/lib/gpaSystem";
import { nonNegativeFinite, validPriorGpa } from "@/lib/gpaInputs";
import { createGpaReviewTracker } from "@/lib/gpaReviewTracking";
import { pastTermGpa, pastTermCumulative, sameGpa } from "@/lib/termCheck";
import { gpaContactFollowups, gpaNoticeFollowups, type GpaFollowupData, type GpaFollowupEvent } from "@/lib/gpaFollowups";
import { gpaReviewDestination, rememberGpaReviewDestination, takeGpaReviewDestination } from "@/lib/gpaReviewDestination";

function expression(file: string, name: string, bindings: Record<string, unknown>, callback = true): any {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf); assert(found);
  const code = callback && ts.isCallExpression(found) ? found.arguments[0] : found;
  const js = ts.transpileModule(`const extracted = ${code.getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return extracted;`)(...Object.values(bindings));
}

function storeHarness() {
  const state: any = { academic: { gpaSchemeId: "saudi5" }, cumulativeGpa: 3.8, cumulativeHours: 30.5 };
  const writes: any[] = [], events: { event: string; meta: any }[] = [];
  let changing = false;
  const tracker = createGpaReviewTracker((event, meta) => events.push({ event, meta }));
  const bindings = {
    dataRef: { current: state }, commit: (patch: any) => Object.assign(state, patch),
    persistSemesterProgress: (patch: any) => writes.push(patch), persistPref: () => {},
    currentUidRef: { current: "test-user" }, readyUidRef: { current: "test-user" }, semesterIdRef: { current: "term" },
    historicalSelectionRef: { current: null }, gpaReviewTrackerRef: { current: tracker },
    resolveScheme, gpaReviewId, captureGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey, legacyReferenceBeforeChange, validPriorGpa, nonNegativeFinite,
    accountDataChanging: () => changing, releaseUniversityHolidays: () => null, setSemester: () => {},
    universityLogTimer: { current: null }, setTimeout: () => 0, clearTimeout: () => {}, db: { logEvent: () => {} },
  };
  const get = (name: string) => expression("src/store/index.tsx", name, { ...bindings, confirmPreviousGpa: expression("src/store/index.tsx", "confirmPreviousGpa", bindings) });
  return { state, writes, events, get, switching: (value: boolean) => { changing = value; } };
}

test("D1 actual compare rejects an obsolete counted letter, while excluded rows preserve it", () => {
  const run = (grade: string, excludedFromGpa = false) => {
    let error: string | undefined, result: any;
    expression("src/components/TermCheck.tsx", "compare", {
      rows: [{ name: "Kept", hours: "3", grade: "B", pct: "", excludedFromGpa: false }, { name: "Old", hours: "3", grade, pct: "", excludedFromGpa }],
      parseNumber: (value: string) => value.trim() ? Number(value) : NaN, scheme: SAUDI5, SPECIAL_RESULTS,
      setError: (value: string) => { error = value; }, t: (key: string) => key,
      pastTermGpa, pastTermCumulative, portalRaw: "4", cumBeforeRaw: "", cumHoursRaw: "", cumAfterRaw: "",
      term: null, name: "Term", pastTerms: [], newId: () => "term", sameGpa, consent: false,
      setPastTerms: (rows: any[]) => { result = rows[0]; }, reportTermCheck: () => {}, setSaved: () => {},
      university: "Test", catalog: null,
    })();
    return { error, result };
  };
  assert.equal(run("ZZ").error, "pt_errLetter");
  assert.equal(run("ZZ").result, undefined);
  assert.equal(run("ZZ", true).result.courses[1].letter, "ZZ");
  assert.equal(run("W").result.ours, 4);
  assert.equal(run("DN").result.ours, 2.5);
});

test("the actual TermCheck gate exempts zero prior hours, retaining the positive-hours gate", () => {
  const gate = (cumulativeHours: number) => expression("src/components/TermCheck.tsx", "systemReviewNeeded", {
    cumulativeHours, scheme: SAUDI4, cumulativeGpaSystem: captureGpaSystem(SAUDI5), gpaSystemChanged,
  }, false);
  assert.equal(gate(0), false); assert.equal(gate(30.5), true);
});

test("held surfaces use the unmodified prior number only while the cumulative result is held", () => {
  const ref = captureGpaSystem(SAUDI5);
  assert.equal(heldPreviousGpa(null, "cumulative", 4.8, 30, SAUDI4, ref), 4.8);
  assert.equal(heldPreviousGpa(null, "cumulative", 3.8, 30, SAUDI4, ref), null);
  assert.equal(heldPreviousGpa(3.9, "cumulative", 3.8, 30, SAUDI4), null);
  assert.equal(heldPreviousGpa(null, "semester", 4.8, 30, SAUDI4, ref), null);
  assert.equal(heldPreviousGpa(null, "cumulative", 4.8, 0, SAUDI4, ref), null);
});

test("C1 actual academic writer captures the old legacy system at a real change, never at cosmetic edits", () => {
  const h = storeHarness(), setAcademic = h.get("setAcademic");
  setAcademic({ major: "Changed name only" });
  assert.equal(h.state.cumulativeGpaSystem, undefined);
  setAcademic({ gpaSchemeId: "saudi4" });
  assert.equal(h.state.cumulativeGpaSystem.max, 5);
  assert.equal(h.state.cumulativeGpa, 3.8);
  assert.equal(h.writes.at(-1).cumulativeStartSystem.max, 5);
  const reference = h.state.cumulativeGpaSystem;
  assert.equal(typeof reference.reviewId, "string");
  setAcademic({ gpaSchemeId: "saudi5" });
  assert.equal(h.state.cumulativeGpaSystem, reference);
  const zero = storeHarness(); zero.state.cumulativeHours = 0; zero.get("setAcademic")({ gpaSchemeId: "saudi4" });
  assert.equal(zero.state.cumulativeGpaSystem, undefined);
  assert.equal(legacyReferenceBeforeChange(30, undefined, SAUDI5, { ...SAUDI5, bands: [...SAUDI5.bands].reverse() }), undefined);
});

test("accepted-update context preserves the pre-update rules even when the resolver already has the new table", () => {
  const h = storeHarness(); h.state.academic.gpaSchemeId = "saudi4";
  h.get("setAcademic")({ gpaSchemeId: "saudi4" }, SAUDI5);
  assert.equal(h.state.cumulativeGpaSystem.max, 5);
  assert.equal(priorGpaReview(3.8, 30.5, SAUDI4, h.state.cumulativeGpaSystem), "systemChanged");
  const declined = storeHarness(); declined.state.academic.gpaSchemeId = "saudi4";
  declined.get("setAcademic")({ gpaSchemeId: "saudi5" }, SAUDI5);
  assert.equal(declined.state.cumulativeGpaSystem, undefined, "keeping the old table is not a new change");
});

test("one store tracker dedupes three notices, records exactly one confirmation, then a separate edit", () => {
  const h = storeHarness(); h.get("setAcademic")({ gpaSchemeId: "saudi4" });
  const shown = h.get("recordPriorGpaReviewShown");
  shown("systemChanged"); shown("systemChanged"); shown("systemChanged");
  assert.equal(h.events.length, 1);
  const oldKey = h.events[0].meta.review_key;
  assert.equal(h.get("confirmPreviousGpa")(3.8, 30.5, true), true);
  assert.equal(h.events[1].event, "gpa_prior_confirmed");
  assert.equal(h.events[1].meta.review_key, oldKey);
  shown("systemChanged"); assert.equal(h.events.length, 2);
  assert.equal(h.get("confirmCumulativeForSemester")(3.9, 33.5), true);
  assert.equal(h.events.length, 2, "end-of-term confirmation does not duplicate prior confirmation");
  h.get("setAcademic")({ gpaSchemeId: "saudi5" }); shown("systemChanged");
  assert.equal(h.get("confirmPreviousGpa")(3.7, 30.5, true), true);
  assert.equal(h.events.at(-1)?.event, "gpa_prior_edited");
  assert.notEqual(h.events.at(-1)?.meta.review_key, oldKey);
  assert.deepEqual(Object.keys(h.events.at(-1)!.meta).sort(), ["max", "review_key", "scheme"]);
});

test("editing a held GPA directly in the dashboard also completes its tracked review", () => {
  const h = storeHarness(); h.get("setAcademic")({ gpaSchemeId: "saudi4" });
  h.get("recordPriorGpaReviewShown")("systemChanged");
  h.get("setCumulativeGpa")(3.7);
  assert.deepEqual(h.events.map(e => e.event), ["gpa_prior_review_shown", "gpa_prior_edited"]);
  assert.equal("cumulativeStartHours" in h.writes.at(-1), false, "a GPA-only write cannot overwrite a separate hours edit");
});

test("a requested legacy review can also be completed through the existing TermCheck prior confirmation", () => {
  const h = storeHarness(); h.get("recordPriorGpaReviewShown")("requested");
  h.get("confirmPreviousGpa")(3.8, 30.5);
  assert.deepEqual(h.events.map(e => e.event), ["gpa_prior_review_shown", "gpa_prior_confirmed"]);
  assert.equal(h.events[0].meta.review_key, h.events[1].meta.review_key);
});

test("account switches block every review write/event, including end confirmation", () => {
  const h = storeHarness(); h.switching(true);
  assert.equal(h.get("confirmCumulativeForSemester")(3.8, 30.5), false);
  assert.equal(h.get("confirmPreviousGpa")(3.8, 30.5, true), false);
  h.get("setAcademic")({ gpaSchemeId: "saudi4" }); h.get("recordPriorGpaReviewShown")("requested");
  assert.equal(h.writes.length, 0); assert.equal(h.events.length, 0); assert.equal(h.state.cumulativeGpaSystem, undefined);
});

test("the actual logEvent path refuses a review event bound to another account", async () => {
  const file = "src/lib/db.ts", source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "logEvent");
  assert(node);
  const js = ts.transpileModule(`const extracted = ${node.getText(sf).replace(/^export /, "")};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const inserts: any[] = [];
  const log = new Function("tourIsActive", "sessionUserId", "supabase", `${js}; return extracted;`)(
    () => false, async () => "current-account", { from: () => ({ insert: async (value: any) => inserts.push(value) }) },
  );
  await log("gpa_prior_review_shown", {}, "previous-account"); assert.equal(inserts.length, 0);
  await log("gpa_prior_confirmed", {}, "current-account"); assert.equal(inserts[0].user_id, "current-account");
});

test("reference identities survive JSON while later identical grading transitions get a fresh event key", () => {
  const a = captureGpaSystem(SAUDI5, "first"), b = captureGpaSystem(SAUDI5, "second");
  assert.equal(readGpaSystem(JSON.parse(JSON.stringify(a)))?.reviewId, "first");
  assert.equal(gpaSystemChanged(SAUDI5, a), false);
  assert.notEqual(priorGpaReviewKey(a, SAUDI4, "systemChanged", "term"), priorGpaReviewKey(b, SAUDI4, "systemChanged", "term"));
});

const event = (user_id: string, at: string, name: string, meta: Record<string, unknown> = {}): GpaFollowupEvent => ({ user_id, at, event: name, meta, email: null });
const contact = (user_id: string, grp: "G2" | "G3") => ({ user_id, grp, email: null, reason: "Test", contacted_at: "2026-11-09T10:00:00Z", channel: "push" as const, note: "", closed_at: null });
test("admin statuses recompute old false matches and separate G2 checks from G3 explicit confirmations", () => {
  const data: GpaFollowupData = { contacts: [contact("waiting", "G2"), contact("wrong", "G2"), contact("match", "G2"), contact("prior", "G3")], reviews: [], checks: [
    event("wrong", "2026-11-09T11:00:00Z", "past_term_checked", { result: "match", ours: 3.4, portal: 3.42 }),
    event("match", "2026-11-09T11:00:00Z", "past_term_checked", { result: "match", ours: 4, portal: 4 }),
    event("prior", "2026-11-09T11:00:00Z", "past_term_checked", { result: "match", ours: 4, portal: 4 }),
  ] };
  let rows = gpaContactFollowups(data);
  assert.deepEqual(rows.map(r => r.status), ["waiting", "not resolved", "resolved", "waiting"]);
  assert.equal(rows[1].comparison?.oldResultWrong, true);
  data.reviews.push(event("prior", "2026-11-09T11:01:00Z", "gpa_prior_edited"));
  rows = gpaContactFollowups(data); assert.equal(rows[3].status, "resolved");
});

test("admin notice follow-up uses the latest pending change, with key-safe out-of-order acknowledgements", () => {
  const rows = [event("student", "2026-11-09T10:00:00Z", "gpa_prior_review_shown", { review_key: "one" }),
    event("student", "2026-11-09T10:01:00Z", "gpa_prior_confirmed", { review_key: "one" }),
    event("student", "2026-11-09T11:00:00Z", "gpa_prior_review_shown", { review_key: "two" })];
  assert.equal(gpaNoticeFollowups(rows)[0].status, "not yet");
  rows.push(event("student", "2026-11-09T10:59:59Z", "gpa_prior_edited", { review_key: "two" }));
  const result = gpaNoticeFollowups(rows)[0]; assert.equal(result.status, "edited"); assert.equal(result.firstShown, rows[0].at);
});

test("sign-in destination accepts only the two local GPA links and consumes them once", () => {
  assert.equal(gpaReviewDestination("https://evil.test/dashboard?review=prior"), null);
  assert.equal(gpaReviewDestination("//evil.test/profile?review=past"), null);
  assert.equal(gpaReviewDestination("/dashboard/?review=prior&other=ignored"), "/dashboard?review=prior");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"), values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key),
  } });
  try {
    rememberGpaReviewDestination("/dashboard?review=prior"); assert.equal(takeGpaReviewDestination(), "/dashboard?review=prior"); assert.equal(takeGpaReviewDestination(), null);
    rememberGpaReviewDestination("/profile?review=past"); rememberGpaReviewDestination("/notes"); assert.equal(takeGpaReviewDestination(), null);
  } finally { if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor); else Reflect.deleteProperty(globalThis, "sessionStorage"); }
});

test("draft follow-up migration is locked, guarded and has no contact seeds or message sends", () => {
  const sql = fs.readFileSync("supabase/migrations/20261109103843_gpa_review_followups.sql", "utf8");
  assert.match(sql, /alter table public\.gpa_followups enable row level security/i);
  assert.match(sql, /revoke all on table public\.gpa_followups from public, anon, authenticated, service_role/i);
  for (const name of ["admin_gpa_followups", "admin_set_gpa_followup"]) {
    const body = sql.slice(sql.indexOf(`function public.${name}(`)).split("$$;")[0];
    assert.match(body, /security definer set search_path = ''/);
    assert.match(body, /auth\.uid\(\) is null or not coalesce\(public\.is_admin_current\(\), false\)/);
  }
  assert.match(sql, /user_events_gpa_review_shown_once/); assert.match(sql, /user_events_gpa_review_completed_once/);
  assert.match(sql, /'checks', public\.admin_gpa_checks\(\)/);
  assert.doesNotMatch(sql, /values\s*\(\s*'[0-9a-f]{8}-/i);
  assert.doesNotMatch(sql, /net\.http|send_email|send_push|cron\.schedule/i);
});

test("Round2 actual end-save guard ignores unused prior data, but blocks a positive-hours change", () => {
  const h = storeHarness();
  h.state.cumulativeGpaSystem = captureGpaSystem(SAUDI5);
  h.state.academic.gpaSchemeId = "saudi4";
  const confirm = h.get("confirmCumulativeForSemester");
  assert.equal(confirm(3.82, 33.5), false);
  assert.equal(h.writes.length, 0);
  h.state.cumulativeHours = 0;
  assert.equal(confirm(4, 3), true);
  assert.equal(h.writes.at(-1).cumulativeEndGpa, 4);
});

test("Round2 actual tracking keeps one pending change across a late cutoff load", () => {
  const h = storeHarness(), academic = h.get("setAcademic"), shown = h.get("recordPriorGpaReviewShown");
  academic({ gpaSchemeId: "saudi4" }); shown("systemChanged");
  academic({ gpaSchemeId: "custom", customScheme: { max: 4, bands: SAUDI4.bands.map((b, i) => ({ ...b, min: i ? b.min + 0.1 : b.min })) } });
  shown("systemChanged");
  assert.equal(h.events.filter(e => e.event === "gpa_prior_review_shown").length, 1);
  assert.equal(h.get("confirmPreviousGpa")(3.8, 30.5), true);
  assert.equal(h.events.filter(e => e.event === "gpa_prior_confirmed").length, 1);
});
