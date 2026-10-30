"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign out.");
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-signout">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="button" className="auth-text-button" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
