import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const accountRoles = ["talent", "employer", "recruiter", "administrator"] as const;
export type AccountRole = (typeof accountRoles)[number];

export type AuthenticatedProfile = {
  id: string;
  display_name: string;
  role: AccountRole;
  onboarding_complete: boolean;
};

export async function getAuthenticatedProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Supabase could not validate the current session.", userError);
    return null;
  }
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,role,onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Could not load the signed-in profile: ${profileError.message}`);
  if (!profile || !accountRoles.includes(profile.role as AccountRole)) return null;

  return {
    id: profile.id,
    display_name: profile.display_name,
    role: profile.role as AccountRole,
    onboarding_complete: profile.onboarding_complete,
  } satisfies AuthenticatedProfile;
}

export async function requireAuthenticatedProfile() {
  const profile = await getAuthenticatedProfile();
  if (!profile) redirect("/auth");
  return profile;
}

export async function requireCompletedProfile() {
  const profile = await requireAuthenticatedProfile();
  if (!profile.onboarding_complete) redirect("/onboarding");
  return profile;
}

export async function requireRole(roles: readonly AccountRole[]) {
  const profile = await requireCompletedProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard?unauthorized=1");
  return profile;
}
