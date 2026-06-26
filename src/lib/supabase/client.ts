"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * Haven ships as a static export (no Node server), so all Supabase access
 * happens in the browser using the public NEXT_PUBLIC_* keys. Data access is
 * gated by Row Level Security on the database — there is no auth here yet, so
 * tables that visitors write to must allow the `anon` role.
 *
 * A single shared instance avoids spinning up multiple clients per render.
 */
let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return client;
}
