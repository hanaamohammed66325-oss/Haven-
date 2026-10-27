# Group session launch

Status: owner authorized immediate production release on2026-10-27 after the
original midnight deadline passed. No campaign contact is permitted before
frontend publication and server activation. Existing included email allowance
may be used without purchasing capacity or allowing overage.
Target: 2026-10-27 00:00 Asia/Riyadh = 2026-10-26 21:00 UTC.

The popup uses the existing WhatsNew account preference history (version 7).
The legacy tour still acknowledges version 6, so completing unfinished
onboarding cannot silently dismiss the group welcome. The welcome becomes
active with the reactive scheduled availability hook; the public closed server
snapshot retains version6 and hydrates safely, then updates without remounting
the app. An in-flight version6 save cannot advance the new version7 journey.
Progress is saved per account, and Later defers the remaining steps for the
current browser session. The final action opens `/study/` after a successful save.

The visual is the existing `GroupLakeFilm` / `StudyScene` renderer with sample
inputs, including its actual river transition and achievement lake. The email
image is a native1800x1080lossless export of that scene (replacing the small
browser screenshot after owner feedback), saved under
`public/announcements/group-launch-lake.png`. No generated artwork is used.

## Audience and delivery

- One launch snapshot, with at most one channel per confirmed, nondeleted,
  unbanned account. Accounts created after preparation are excluded.
- Use the latest of account creation, actual app activity and Auth sign-in.
  Invalid activity fails closed; a new return is checked again before delivery.
- At least 3 full elapsed days and less than 7: push, if a subscription exists
  and group notifications were not disabled. No email fallback for this cohort.
- At least 14 full elapsed days: email, including people with push devices.
- At least 7 days and less than 14: neither launch message.
- The email is bilingual; push follows the user's app language. Both open `/study/`.

The function persists its draft and delivery statuses in the existing locked
`public.app_config` table. RLS is enabled with zero policies; service role access
is required. No schema change is needed. Responses contain counts only.

POST modes (all require the existing scheduler bearer; never expose it to a client):

- `preview` (default): counts only, no persistence and no provider calls.
- `prepare`: creates an immutable draft audience once. A duplicate request cannot
  overwrite the existing snapshot or its delivery history.
- `status`: counts and campaign status only.
- `activate`: requires explicit public launch confirmation, a start/end window
  (at most 31 days) and a provider-verified free email budget of 1–90 for the
  current UTC day. Use `freeQuotaVerified: true`, `publicLaunchConfirmed: true`,
  `freeEmailBudget`, `startsAt`, `expiresAt` only after actual checks/owner approval.
  A fresh verification is required for another day's email allowance; an existing
  day's reservation count is preserved. This function does not discover quota.
- `send`: processes at most one pending recipient. It has no default quota and
  does not schedule itself. The invocation cadence must be approved separately.
- `preflight`: authenticated read-only check of the existing sender's Resend
  usage endpoint. Returns quota/readiness only; no audience or provider send.
- `tick`: requires the exact approved schedule row, frontendReady/serverOpened,
  and the fixed launch window. Creates the immutable audience at launch, derives
  a fresh Free-plan allowance from actual daily/monthly usage, then processes at
  most one pending push and one pending email, in sequence. Preserves the day's
  reservations; unknown/exhausted quota withholds email and never spends blindly.
  Only verified included monthly allowance is accepted, with10emails of headroom
  for normal account email and at most90campaign emails per UTC day. An existing
  plan with no daily cap still obeys the campaign cap; unknown/unlimited monthly
  quota is rejected. No upgrade, purchase or overage is authorized.

Every provider call is fenced by an atomic compare-and-set on the stored state.
The short `updated_at` revision is compared instead of placing the entire
audience JSON in the REST URL. Every successful update advances that revision,
including consecutive writes within the same millisecond; the database-returned
revision fences completion. Conflicting activation returns 409 without claiming
that the draft was activated.
An interrupted or uncertain call is retained as sending/review and is not retried
automatically. A failure pauses the campaign. Review provider/history evidence
before any manual resolution; do not erase or recreate the snapshot.

The existing `send-email` function adds a template and a stable Resend
`Idempotency-Key`, while retaining legacy templates and plaintext. Provider
idempotency lasts 24 hours; durable campaign statuses are the longer-lived guard.
`sent` means provider accepted, not proof of inbox/device delivery.

## Release prerequisites

Owner approval of the previews and exact launch/delivery scope; public frontend
group gate and server `study.config.enabled_for_all` actually enabled; the real
scene image published; free provider quota verified; explicit delivery dates,
budget and cadence. Existing reengagement is unchanged and should be checked
for overlapping contacts at launch. The approved new guard yields generic
reengagement throughout the fixed launch window until 2026-11-10 00:00Saudi,
then resumes automatically. The existing enable flag/cron are not disabled.

The migration installs one locked INVOKER routine and a minute cron. It opens
the existing server gate no earlier than the exact UTC launch instant and calls
the authenticated tick. The existing scheduler credential is reused entirely
inside PostgreSQL, never returned/printed or embedded in source. The named cron
removes itself on completion or expiry; ambiguous/paused sends remain held for
review. Apply only after frontend/image publication and successful preflight.

Deploying the new function requires the same scheduler-bearer authentication
pattern as the existing sender. If platform JWT verification is disabled for
that scheduler invocation, retain the mandatory application bearer check.
Never invoke modes from a public browser or put a scheduler secret in a URL.

Local checks cover cohort boundaries, account history, concurrency, return
suppression, locked activation, failure handling, endpoint dry runs, unchanged
old email templates and sender idempotency. Edge type checking uses the installed
Supabase typings with minimal Deno/Web Push declarations; no Deno deployment or
real provider test was performed.

The group-list URL and exact referral anchor survive the existing authentication
redirect. External destinations, arbitrary profile anchors and extra query
parameters remain rejected. The launch still requires the public frontend/server
gates to open together; local route tests do not open either production gate.

Additional adapter verification uses the actual installed Supabase query builder
and real endpoint with intercepted HTTP/providers: a 635-recipient fixture keeps
CAS URLs at 153 bytes and parallel workers contact one provider once. A read-only
probe with fabricated data reproduced the former 81KB URL's 414 response. No
production campaign row or delivery was created for these checks.
