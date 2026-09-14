# noon payments — setup (test first)

Haven's paid subscriptions run through **noon hosted checkout**. The card is
entered on noon's page — Haven never sees card data. Two edge functions do the
work; everything else (plans, subscription record, access gating) already exists.

## 1. Secrets (set in Supabase, never in code)

Supabase Dashboard → Project Settings → **Edge Functions → Secrets** (or
`supabase secrets set NAME=value`). Set these from your noon **TEST** portal:

| Secret | Value (test) |
|---|---|
| `NOON_API_BASE` | noon's TEST API base, e.g. `https://api-test.sa.noonpayments.com` |
| `NOON_KEY_MODE` | `Test` |
| `NOON_BUSINESS_ID` | your business identifier (e.g. `haven`) |
| `NOON_APP_NAME` | the application name/identifier from the portal |
| `NOON_API_KEY` | the API key for that application |
| `APP_BASE_URL` | where the user returns, e.g. `https://havenstudent.com` (or the staging URL) |

Confirm the exact API base URL and the application name against your noon
portal / docs (docs.noonpayments.com). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.

Going LIVE later = swap to the live API base + `NOON_KEY_MODE=Live` + live keys,
then flip `ENFORCE_PREMIUM` to `true` in `src/lib/premium.js`.

## 2. Functions

- `noon-initiate` — POST from /checkout. Auth's the user, validates the plan,
  writes a `pending` subscription, creates the noon order, returns the hosted
  payment URL. Deploy with **verify_jwt = true is NOT required** (it verifies the
  JWT itself); leaving verify_jwt on is fine since the client sends a Bearer token.
- `noon-callback` — noon's `returnUrl`. The browser lands here after payment;
  it re-verifies the order with noon and activates the subscription, then
  redirects to the app. **Deploy with `verify_jwt = false`** (the browser
  arrives with no JWT).

## 3. Test flow

1. Set the secrets above.
2. Deploy both functions.
3. On a staging build with `ENFORCE_PREMIUM = true`, open /checkout, pick a plan,
   Continue to payment → pay with a noon **test card**
   (https://docs.noonpayments.com/test/cards).
4. You should return to `/profile?subscribed=1` and the subscription row should
   read `status = active`.

## 4. Not built yet (next increment)

- Recurring billing / card-on-file (noon payment token) + free-trial-then-charge.
- A server-to-server webhook (in addition to the return URL) for reliability.
- Apple Pay button (noon supports it on the hosted page).
