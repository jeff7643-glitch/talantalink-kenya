"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!configured) {
      setError("Supabase isn’t configured yet. Add your project URL and publishable/anon key to .env.local, then restart the app.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "sign-up") {
        const displayName = String(formData.get("displayName") ?? "").trim();
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice("Account created. Check your email to confirm your address, then sign in.");
          setMode("sign-in");
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }

      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link className="brand" href="/">
          <span className="brand-shield"><span /><span /><span /></span>
          <span className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></span>
        </Link>
        <Link href="/" className="auth-back">Back to home <span>→</span></Link>
      </header>
      <section className="auth-card">
        <div className="auth-mark">✳</div>
        <p className="eyebrow">{mode === "sign-in" ? "WELCOME BACK" : "YOUR NEXT CHAPTER"}</p>
        <h1>{mode === "sign-in" ? "Make yourself at home." : "There’s a place for your talent."}</h1>
        <p className="auth-subtitle">{mode === "sign-in" ? "Sign in to pick up where you left off." : "Create your account and meet your community."}</p>
        {!configured && <div className="setup-notice"><strong>Backend setup needed</strong><span>Add the Supabase project URL and public anon key to <code>.env.local</code>. See the project README for setup steps.</span></div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-success" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "sign-up" && <label>Your name<input name="displayName" autoComplete="name" required maxLength={100} placeholder="e.g. Alex Ouma" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={8} placeholder="At least 8 characters" /></label>
          <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"} <span>→</span></button>
        </form>
        <p className="auth-switch">{mode === "sign-in" ? "New to TalantaLink?" : "Already have an account?"} <button type="button" onClick={() => { setError(""); setNotice(""); setMode(mode === "sign-in" ? "sign-up" : "sign-in"); }}>{mode === "sign-in" ? "Create an account" : "Sign in"}</button></p>
        <p className="auth-privacy">By continuing, you agree to use this community respectfully. We&apos;ll never sell your personal details.</p>
      </section>
    </main>
  );
}
