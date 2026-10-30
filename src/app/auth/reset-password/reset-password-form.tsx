"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/dashboard?password=updated");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password.</h1>
        <p className="auth-subtitle">Use at least eight characters. You’ll be signed in with your new password.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>New password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
          <label>Confirm new password<input name="confirmation" type="password" required minLength={8} autoComplete="new-password" /></label>
          <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? "Updating..." : "Update password"} <span>→</span></button>
        </form>
      </section>
    </main>
  );
}
