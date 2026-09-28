import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';

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
// Time limits for requests that must never hang. supabase-js sends its requests
// with no timeout. When a PWA is reopened after a while, the access token has
// expired, so auth refreshes it before anything else. If that /token request
// stalls (the phone's network is still waking up, or the request was frozen
// mid-flight while the app was in the background), the auth client's
// initialisation never finishes. Every getSession(), onAuthStateChange and
// database query then waits on it forever, and the app is stuck on the loader
// until it is force-closed. Aborting a stalled request turns it into a normal
// network error, which auth retries on its own and the store's load recovers
// from. Edge Functions and Storage are left alone: checkout and uploads can
// legitimately take longer.
const AUTH_REQUEST_TIMEOUT_MS = 8000;
const REST_REQUEST_TIMEOUT_MS = 20000;

function timeoutFor(url: string): number | null {
  if (url.includes('/auth/v1/')) return AUTH_REQUEST_TIMEOUT_MS;
  if (url.includes('/rest/v1/')) return REST_REQUEST_TIMEOUT_MS;
  return null;
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const ms = timeoutFor(url);
  if (ms === null) return fetch(input, init);

  const controller = new AbortController();
  // Not cleared when the headers arrive: the body can stall too, and aborting a
  // request that already finished does nothing.
  setTimeout(() => controller.abort(), ms);
  // Keep a caller's own abort (e.g. a query's .abortSignal()) working too.
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: fetchWithTimeout },
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

// True while this device still holds a sign-in. Auth reports "no session" both
// when the user is signed out and when refreshing an expired token failed on the
// network; only the first one clears the stored token (auth removes it exactly
// when the session is dead). The store checks this before treating a missing
// session as signed out, so a slow connection at launch waits instead of
// sending a signed-in user to the sign-in page.
export function hasStoredSession(): boolean {
  try {
    const v = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return !!v && v !== 'null' && v !== 'undefined';
  } catch {
    return false;
  }
}

// The signed-in user's id, read from the session on this device. No network
// call unless the access token needs refreshing (and concurrent refreshes are
// shared). Use this, not auth.getUser(), to learn who is signed in: getUser()
// asks the server every time, and the browser queues identical requests one
// behind the other, so each call at launch waited on the ones before it and
// chained the whole start-up (6+ calls, about 0.3s each). Safe for access
// control: the database checks the signed token on every request (RLS), never
// this id. Throws when the token couldn't be refreshed because of the network,
// so callers fail (and retry) as a network error instead of acting signed out.
export async function sessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error && isAuthRetryableFetchError(error)) throw error;
  return data.session?.user?.id ?? null;
}

export interface FunctionResponse {
  ok: boolean;
  status: number;
  /** The parsed JSON body; {} when there is none. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

// Call one of our Edge Functions as the signed-in user. null when no one is
// signed in. The body is returned for error statuses too, because callers read
// error codes from it (e.g. "wrong_current_password").
export async function callFunction(name: string, body?: unknown): Promise<FunctionResponse | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}
