"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

// Permanently deletes the calling user's account. The `delete_my_account` RPC
// removes only the authenticated user; every table cascades from auth.users, so
// all of their data goes with it. After the RPC we end the Supabase session
// (which fires onAuthStateChange("SIGNED_OUT") and clears the local store) and
// send the user back to the public landing page.
export function useDeleteAccount() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { error: rpcError } = await supabase.rpc("delete_my_account");
      if (rpcError) throw rpcError;
      await supabase.auth.signOut();
      router.replace("/");
      // Leave `loading` true through the redirect so the button never flips
      // back to its idle label while the page is tearing down.
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [router]);

  const reset = useCallback(() => setError(false), []);

  return { deleteAccount, loading, error, reset };
}
