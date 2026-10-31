import { Suspense } from "react";
import Link from "next/link";
import { requireCompletedProfile } from "@/lib/auth/dal";
import SignOutButton from "./sign-out-button";

export const metadata = {
  title: "Your dashboard",
  robots: { index: false, follow: false },
};

async function DashboardContent() {
  const profile = await requireCompletedProfile();
  const roleLabel = profile.role[0].toUpperCase() + profile.role.slice(1);

  return (
    <main className="auth-page">
      <section className="auth-card account-dashboard">
        <p className="eyebrow">TALANTALINK ACCOUNT</p>
        <h1>Welcome, {profile.display_name}.</h1>
        <p className="auth-subtitle">You’re signed in as a {roleLabel}. Your account and profile are protected by Supabase.</p>
        {profile.role === "administrator" && <p className="auth-success">Administrator access is enabled for this account.</p>}
        <div className="dashboard-actions">
          <Link className="primary-button" href="/profile/edit">Edit professional profile <span>→</span></Link>
          <Link className="outline-button" href={`/talent/${profile.id}`}>View profile</Link>
          <Link className="primary-button" href="/">Go to the community <span>→</span></Link>
          <Link className="outline-button" href="/notifications">Notification centre</Link>
          {["employer", "recruiter"].includes(profile.role) && <Link className="outline-button" href="/employer">Employer dashboard</Link>}
          {profile.role === "administrator" && <Link className="outline-button" href="/admin">Open administration</Link>}
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<main className="auth-page" aria-busy="true" />}><DashboardContent /></Suspense>;
}
