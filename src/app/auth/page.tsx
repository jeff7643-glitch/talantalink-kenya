"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up" | "forgot-password";
type MemberRole = "talent" | "employer" | "recruiter";

function getSafeNextPath() {
  const nextPath = new URLSearchParams(window.location.search).get("next");
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//") || nextPath.includes("\\")) return "/dashboard";
  return new URL(nextPath, window.location.origin).origin === window.location.origin ? nextPath : "/dashboard";
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [role, setRole] = useState<MemberRole>("talent");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "verification") {
      queueMicrotask(() => setError("That email link could not be verified. Request a fresh link and try again."));
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setVerificationPending(false);

    if (!configured) {
      setError("Supabase isn’t configured yet. Add your project URL and publishable/anon key to .env.local, then restart the app.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim();
    setEmail(submittedEmail);
    const callbackUrl = new URL("/auth/callback", window.location.origin);

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "sign-up") {
        const displayName = String(formData.get("displayName") ?? "").trim();
        callbackUrl.searchParams.set("next", "/onboarding");
        const { data, error: authError } = await supabase.auth.signUp({
          email: submittedEmail,
          password: String(formData.get("password") ?? ""),
          options: {
            data: { display_name: displayName, role },
            emailRedirectTo: callbackUrl.toString(),
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice("Your account is ready. Check your email and verify your address before signing in.");
          setVerificationPending(true);
          return;
        }
        router.replace("/onboarding");
      } else if (mode === "forgot-password") {
        callbackUrl.searchParams.set("next", "/auth/reset-password");
        const { error: authError } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
          redirectTo: callbackUrl.toString(),
        });
        if (authError) throw authError;
        setNotice("If an account exists for that email, a password reset link is on its way.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: submittedEmail,
          password: String(formData.get("password") ?? ""),
        });
        if (authError) throw authError;
        router.replace(getSafeNextPath());
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!configured || !email) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/onboarding");
      const { error: resendError } = await createSupabaseBrowserClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl.toString() },
      });
      if (resendError) throw resendError;
      setNotice("A fresh verification link has been sent. Check your inbox.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resend the verification email.");
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = mode === "sign-up";
  const isForgotPassword = mode === "forgot-password";
  const title = isSignUp
    ? "Make room for what you do best."
    : isForgotPassword
      ? "Reset your password."
      : "Welcome back to your community.";

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
        <p className="eyebrow">{isSignUp ? "YOUR NEXT CHAPTER" : isForgotPassword ? "ACCOUNT RECOVERY" : "WELCOME BACK"}</p>
        <h1>{title}</h1>
        <p className="auth-subtitle">
          {isSignUp
            ? "Create an account to share your work and find opportunities across Kenya."
            : isForgotPassword
              ? "Enter the email address linked to your account and we’ll send a secure reset link."
              : "Sign in to reconnect, share updates and explore what’s new."}
        </p>
        {!configured && <div className="setup-notice"><strong>Backend setup needed</strong><span>Add the Supabase project URL and public anon key to <code>.env.local</code>. See the project README for setup steps.</span></div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-success" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {isSignUp && <label>Your name<input name="displayName" autoComplete="name" required maxLength={100} placeholder="Your full name" /></label>}
          {isSignUp && <label>I’m joining as
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as MemberRole)}>
              <option value="talent">Talent</option>
              <option value="employer">Employer</option>
              <option value="recruiter">Recruiter</option>
            </select>
          </label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          {!isForgotPassword && <label>Password<input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters" /></label>}
          <button type="submit" className="primary-button auth-submit" disabled={busy}>
            {busy ? "Please wait..." : isSignUp ? "Create account" : isForgotPassword ? "Send reset link" : "Sign in"} <span>→</span>
          </button>
        </form>
        {verificationPending && <button type="button" className="auth-text-button" disabled={busy} onClick={() => void resendVerification()}>Resend verification email</button>}
        {mode === "sign-in" && <button type="button" className="auth-text-button" onClick={() => { setError(""); setNotice(""); setMode("forgot-password"); }}>Forgot your password?</button>}
        <p className="auth-switch">
          {isForgotPassword ? "Remembered your password?" : isSignUp ? "Already have an account?" : "New to TalantaLink?"}{" "}
          <button type="button" onClick={() => { setError(""); setNotice(""); setVerificationPending(false); setMode(isForgotPassword || isSignUp ? "sign-in" : "sign-up"); }}>
            {isForgotPassword || isSignUp ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="auth-privacy">By continuing, you agree to use this community respectfully. We&apos;ll never sell your personal details.</p>
      </section>
    </main>
  );
}
