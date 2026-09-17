# Haven — Organic Growth Work (Retention + Referral) · WIP LOG

Status snapshot. Everything below is **committed locally only on branch
`feat/re-engagement` and has NOT been pushed or deployed.** Resume from here.

Companion acquisition funnel (SEO / tools / university pages) is tracked
separately — see the `haven-seo-growth` memory. This file covers the two
growth-loop halves: **retention (win-back)** and **referral (ambassador)**.

---

## 0. Hard constraints (do not violate on resume)

- **Nothing gets pushed or deployed without Hanaa's explicit go-ahead**
  ("قبل ماتنشر اسالني"). This includes `git push`, Supabase edge-function
  deploys, and flipping any secret.
- **Hanaa herself** deploys the edge functions and flips `REENGAGE_ENABLED`
  when she's ready. Claude must not.
- Agreed build order: **retention FIRST (done, gated off) → referral.**
- Referral is built **nucleus first** (codes + survey + activation-gated
  counter + owner stats), rewards **after**.
- Stack rules: plain React + localStorage/Supabase + CSS, no heavy libs;
  static export (`output: "export"`); personalization-first; no decorative
  emoji in UI; every feature adapts to user data.

---

## 1. Retention — win-back engine  (CODE DONE, gated OFF, NOT deployed)

Branch `feat/re-engagement`, top commit `7371992`.

- `supabase/functions/reengage-tick/index.ts` — targets lapsed users
  (quiet 7–120d, 14d cooldown, cap 200/run). Channel per user:
  push if they have a subscription, else email. Master switch:
  secret `REENGAGE_ENABLED` must equal `"true"` or every tick is a no-op.
  Test hooks: `?dryRun=1`, `?onlyUser=<uuid>`.
  - Variants (push): `setup` (no courses) / `grades` (courses but no scored
    `grade_components`) / `back` (generic). Several rotating friendly,
    gender-neutral AR/EN lines per variant, seeded by (userId + dayNumber)
    so repeat nudges never read the same.
  - Email variant for opted-out users: `setup` if no courses, else `notif`
    (warm "we miss you" + enable-notifications, CTA to Settings).
- `supabase/functions/send-email/index.ts` — added the `notif` reengage
  email template (subject "اشتقنا لك — فعّل تنبيهات Haven").

**To go live (Hanaa does this):** deploy `reengage-tick` + `send-email`,
ensure the cron caller hits `reengage-tick`, then set `REENGAGE_ENABLED=true`.
Verify first with `?dryRun=1` and `?onlyUser=<her uuid>`.

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

## 3. Also done earlier this stretch (onboarding tour polish, local commits)
`d703be2`, `a6d6186`, `6dc5c12` — scroll-lag fix, lotus rename, planner deadline
demo (color+time+notification), colorful Pomodoro lake, wording tweaks, planner
chip-overflow fix, clickable tour progress dots. Also local-only, unpushed.

---

## Resume checklist
- [ ] (Hanaa) deploy retention edge fns + flip `REENGAGE_ENABLED` when ready.
- [ ] Build referral **nucleus** (tables → survey modal → activation-gated
      counter → owner stats).
- [ ] Build referral **rewards** (badges/XP → exclusive themes → Havi cosmetics
      system from the approved designs).
- [ ] Ambassador panel ("لوحة السفير").
- [ ] Nothing pushed/deployed until Hanaa says so.
