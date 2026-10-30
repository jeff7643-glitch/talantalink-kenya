import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";

async function AdminContent() {
  const profile = await requireRole(["administrator"]);

  return (
    <main className="auth-page">
      <section className="auth-card account-dashboard">
        <p className="eyebrow">RESTRICTED AREA</p>
        <h1>Administrator access.</h1>
        <p className="auth-subtitle">Signed in as {profile.display_name}. This page is available only to accounts assigned the administrator role by a trusted database administrator.</p>
        <Link className="outline-button" href="/dashboard">Return to your dashboard</Link>
      </section>
    </main>
  );
}

export default function AdminPage() {
  return <Suspense fallback={<main className="auth-page" aria-busy="true" />}><AdminContent /></Suspense>;
}
