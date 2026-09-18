# Haven — Organic Growth Work (Retention + Referral) · WIP LOG

Status snapshot, UPDATED. Retention (win-back) has moved past this file —
**it now lives on `main`, code is done, and Hanaa has approved sending.**
Go-live is actively in progress; for that, read repo `WINBACK_DEPLOY.md` on
`main` instead (it has the current blocker + exact next steps). This file
(`GROWTH.md`) itself lives only on branch `feat/referral` (pushed to origin)
and now mainly documents the **referral/ambassador** half, which is still
nucleus-only, not wired into any UI.

Companion acquisition funnel (SEO / tools / university pages) is tracked
separately — see the `haven-seo-growth` memory. This file covers the two
growth-loop halves: **retention (win-back)** and **referral (ambassador)**.

---

## 0. Hard constraints (do not violate on resume)

- **Nothing gets pushed or deployed without Hanaa's explicit go-ahead.** She
  HAS given that go-ahead for win-back sending (after reviewing a full
  preview of every message variant) — see `WINBACK_DEPLOY.md` on `main` for
  where that stands. This constraint still applies to anything NOT yet shown
  to and approved by her (e.g. the referral system below).
- Edge-function deploys: Claude Code's own safety gate hard-blocks the
  Supabase MCP's `deploy_edge_function` tool in this environment — confirmed,
  not a permissions issue. Hanaa deploys edge functions herself via the
  Supabase dashboard; Claude does everything else (SQL, scheduling, testing)
  via the Supabase MCP's `execute_sql`, which works fine.
- Agreed build order: **retention FIRST (done, go-live in progress) → referral.**
- Referral is built **nucleus first** (codes + survey + activation-gated
  counter + owner stats), rewards **after**.
- Stack rules: plain React + localStorage/Supabase + CSS, no heavy libs;
  static export (`output: "export"`); personalization-first; no decorative
  emoji in UI; every feature adapts to user data.

---

## 1. Retention — win-back engine — MOVED, see `WINBACK_DEPLOY.md` on `main`

This is now out of date here on purpose — the retention code has been merged
to `main` (commits `7371992`, `83ff5cd`) and Hanaa has approved sending after
reviewing a full preview of every message. Go-live is actively in progress and
tracked in **repo `WINBACK_DEPLOY.md` on `main`**, which has the current
blocker (edge-function deploy is hard-blocked for Claude in this environment —
Hanaa deploys via the Supabase dashboard) and the exact remaining SQL steps
(dry-run check → flip the `app_config.reengage_enabled` flag → real run →
daily `pg_cron` schedule). Do not duplicate that tracking here — go read that
file for retention status.

---

## 2. Referral / "Ambassador" system  (DESIGN APPROVED, NOT built yet)

### 2a. Decisions locked with Hanaa
- Each user gets a share **code**. A **"how did you hear about us?"** modal on
  new signup (code / X / Instagram / TikTok / Snap / friend / other); answers
  stored for **owner-only** acquisition stats.
- A referral **counts only AFTER the referee activates** (verified email +
  a real step like adding a course) — anti-abuse vs fake accounts.
- **Two-sided reward:** the referee also gets a welcome bonus (XP + small
  badge), not just the referrer.
- Per-user **counter with thresholds 3 / 5 / 7 / 10 / 15**, each unlocking an
  **exclusive** reward (not obtainable any other way — scarcity = "تميّز").
- Reward types: badges, XP, **Havi cosmetics**, **exclusive themes**.

### 2b. Approved visual designs  →  `docs/growth/ambassador-designs.html`
This is the SOURCE of the design mockup (also published as a private Artifact,
currently **Version 10**, URL: https://claude.ai/artifact/QRs1TwUzwogR8Y3tkXsMQh).
Open the HTML locally by copying it into `public/` and serving via the dev
server (JS must run to render the canvases). Contents, all Hanaa-approved:

- **Exclusive themes (3):** شفق / Aurora (unlock 5), مرجان / Coral (10),
  تاج السفير / Ambassador Gold (legendary, 15). Same 4-token structure as
  Haven themes (side / bg / primary / brass).
- **Havi cosmetics (pixel, faithful to the sprite):** graduation cap, glasses,
  beanie, crown, flower crown, headphones, scarf, bow tie, **Throne (العرش)**,
  **Pet / fox (حيوان أليف)**.
  - **Throne** — remade to match Hanaa's reference: red-velvet cushion + gold
    ornate frame + crown finial + red carpet steps, clearly bigger than Havi,
    Havi seated as king **with the crown on his head**. (`renderThrone()`.)
  - **Pet (fox)** — a loyal companion, NOT a 1:1 copy of Havi. It has a mood
    engine that mirrors Havi like a real friend (`animatePet()`):
    - **play**: Havi awake/idle-bobbing → fox fetches (runs out to the card
      edge and trots back, hopping like Havi's walk).
    - **sleep**: Havi dozes with a "z" → fox curls up asleep beside him with
      its own "z" (`drawFoxCurl()`).
    - **cheer**: Havi celebrates → fox bounces happily too + confetti + spark.
    - Shared touches: blinks in sync, bobs in Havi's rhythm at rest.
- **Badges (5 distinct silhouettes, not just colour):** envelope (first
  invite), shield/3 (bronze), star (silver), crown/laurel (gold), diamond
  (legendary).
- **Reward ladder (RUNGS):** 1 → first-invite badge + 50 XP; 3 → bronze badge
  + 100 XP + glasses; 5 → Aurora theme + 150 XP; 7 → scarf + pet + silver
  badge; 10 → Coral theme + small crown + 300 XP + gold badge; 15 → throne +
  gold crown + Ambassador Gold theme + profile flair. Plus the two-sided-reward
  note and the "counts after activation" note.

### 2c. Build plan (NOT started) — nucleus first
1. **Supabase tables** (static export → needs real relational tables, not just
   `profiles.preferences` JSONB):
   - `referral_codes(user_id, code)` — one per user.
   - `referrals(referrer_id, referee_id, status)` — status pending → activated.
   - `acquisition_survey(user_id, source, code?)` — the "how did you hear" answers.
2. **"How did you hear about us?" modal** on first signup → writes
   `acquisition_survey` (+ links the referral if a code was entered).
3. **Activation-gated counter**: a referral flips to `activated` only after the
   referee verifies email + does a real step (e.g. adds a course); the
   referrer's visible count only includes activated ones.
4. **Owner-only acquisition stats** screen/query.
5. THEN rewards: wire thresholds → badges/XP (existing gamification in
   `src/lib/gamification.ts`), exclusive themes (extend `THEMES[]` in
   `src/app/(app)/settings/page.tsx` + `FREE_THEMES`/gating in `premium.js`),
   and a NEW **Havi cosmetics system built from scratch** (none exists in-app
   yet — port the approved pixel designs from `docs/growth/ambassador-designs.html`).
6. A **"لوحة السفير" (Ambassador panel)**: code + share button + counter +
   next reward + full ladder.

**Infra facts:** gamification = XP + 8 levels + tiered badges
(bronze/silver/gold/diamond) in `src/lib/gamification.ts` (badge string ids in
`BADGES[]`, tier advances at 80% of a tier's badges). Themes gated by a `free`
flag. Havi sprite engine (28×21 BODY grid + COL palette) lives in
`src/components/HaviMascot.jsx` — the mockup's pixel helpers mirror it.

---

## 3. Also done earlier this stretch (onboarding tour polish + grade fix)
`d703be2`, `a6d6186`, `6dc5c12` — scroll-lag fix, lotus rename, planner deadline
demo (color+time+notification), colorful Pomodoro lake, wording tweaks, planner
chip-overflow fix, clickable tour progress dots. Plus two more fixes that have
since landed and pushed to `main`: `c4c0c16` (grade-out-of-100 ceiling fix,
descending from A+) and `8dd141a` (onboarding tour mobile/stray-Havi fix). All
of §3 is now on `main` — only §1 (retention, tracked in `WINBACK_DEPLOY.md`)
and §2 (referral, this file) are still mid-flight.

---

## Resume checklist
- [ ] Retention go-live — see `WINBACK_DEPLOY.md` on `main` (in progress:
      waiting on Hanaa to deploy 2 edge functions via the Supabase dashboard).
- [x] Build referral **nucleus** — done on `feat/referral` (`1f0411a`, pushed
      to origin, not merged to `main`, not applied to the database yet).
- [ ] Wire the nucleus into UI: "how did you hear about us?" survey modal on
      signup + call `activateMyReferral()` at the real activation step
      (adding a course) + an ambassador panel ("لوحة السفير": code + share +
      counter + next reward + ladder).
- [ ] Apply `supabase/sql/20260917_referral_nucleus.sql` to the live database
      (via Supabase MCP `execute_sql` — that tool works, unlike edge deploys).
- [ ] Build referral **rewards** (badges/XP → exclusive themes → Havi cosmetics
      system from the approved designs in §2b).
- [ ] Nothing pushed/deployed/sent-to-users without Hanaa's explicit go-ahead
      for that specific thing.
