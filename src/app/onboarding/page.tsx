import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/signed-urls";
import OnboardingForm from "./onboarding-form";

export const metadata = {
  title: "Complete your profile",
  robots: { index: false, follow: false },
};

async function OnboardingContent() {
  const account = await getAuthenticatedProfile();
  if (!account) redirect("/auth");
  if (account.onboarding_complete) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile, error: profileError }, { data: counties, error: countiesError }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,headline,bio,county_id,avatar_path,avatar_bucket").eq("id", account.id).single(),
    supabase.from("counties").select("id,name").order("name"),
  ]);
  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
  if (countiesError) throw new Error(`Could not load counties: ${countiesError.message}`);

  const avatarUrl = (await signAvatarUrls(supabase, [profile])).get(profile.id) ?? null;
  return <OnboardingForm account={account} profile={{ ...profile, avatar_url: avatarUrl }} counties={counties ?? []} />;
}

export default function OnboardingPage() {
  return <Suspense fallback={<main className="auth-page" aria-busy="true" />}><OnboardingContent /></Suspense>;
}
