import { createClient } from '@supabase/supabase-js';

// Exported so callers that talk to Edge Functions directly (e.g. /checkout →
// create-subscription) can build the functions URL and send the `apikey` header
// without re-declaring the project config.
export const SUPABASE_URL = 'https://cseufbkuvhqrkjrhbvaj.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_U4M8BJH04I2yJj3MIp0jFA_8UlSlYlr';

// Canonical production site URL. Used for auth email redirects so confirmation
// links always point at the live site — NEVER window.location.origin, which
// would bake "localhost:3000" into real emails during development.
export const SITE_URL = 'https://havenstudent.com';

// Where confirmation links land: a friendly /welcome page that reads the session
// and forwards to the dashboard (instead of dumping the user on the homepage).
export const WELCOME_URL = 'https://havenstudent.com/welcome';

// Session persistence key. Pinned to Supabase's own default format
// (sb-<project-ref>-auth-token) so it is:
//   • stable across deploys — changing it would silently sign every existing
//     user out on their next visit (their token lives under this exact key), and
//   • recognised by the pre-paint boot script in src/app/layout.tsx, which scans
//     localStorage for `sb-…-auth-token` to know if someone is signed in.
// It does NOT start with "haven", so clearHavenLocalStorage() (which wipes only
// haven* keys on sign-out / account switch) never touches it inadvertently.
const AUTH_STORAGE_KEY = 'sb-cseufbkuvhqrkjrhbvaj-auth-token';

// A signed-in user must stay signed in until they EXPLICITLY sign out — across
// tab closes, full browser restarts, and (the case that motivated this)
// relaunching the installed iOS/iPadOS home-screen PWA.
//
//   • persistSession + storage=localStorage — localStorage survives closing the
//     tab/PWA; sessionStorage would NOT (it's wiped when the PWA is closed), so
//     it is deliberately never used here.
//   • autoRefreshToken — the short-lived access token is refreshed in the
//     background from the long-lived refresh token, so the login never lapses on
//     its own. A refresh that fails because the device is OFFLINE is retried, not
//     treated as a sign-out, so a flaky/offline launch keeps the user in.
//   • detectSessionInUrl — lets the email-link pages pick up the session Supabase
//     puts in the URL.
//   • flowType 'implicit' — INTENTIONAL. This app is a static export with no
//     server to run a PKCE code exchange; /welcome and /reset-password are built
//     to read the tokens Supabase places in the URL hash (implicit). Switching to
//     PKCE would break those links (especially cross-device). flowType has no
//     bearing on session persistence — that is entirely persistSession + storage.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    // This module is imported during the static prerender (Node, no `window`).
    // Only pass localStorage in the browser; the SDK falls back to a safe no-op
    // store during prerender, where there is no user anyway.
    ...(typeof window !== 'undefined' ? { storage: window.localStorage } : {}),
    flowType: 'implicit',
  },
});
