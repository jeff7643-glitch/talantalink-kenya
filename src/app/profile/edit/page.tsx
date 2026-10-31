import { Suspense } from "react";
import { requireCompletedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls, signStoragePaths } from "@/lib/storage/signed-urls";
import ProfileEditorForm, { type Certificate, type PortfolioItem, type ProfileRecord } from "../profile-editor-form";

export const metadata = {
  title: "Edit your profile",
  robots: { index: false, follow: false },
};

async function ProfileEditorContent() {
  const account = await requireCompletedProfile();
  const supabase = await createSupabaseServerClient();
  const [
    { data: profile, error: profileError },
    { data: counties, error: countiesError },
    { data: contacts, error: contactsError },
    { data: portfolio, error: portfolioError },
    { data: certificates, error: certificatesError },
  ] = await Promise.all([
    supabase.from("profiles")
      .select("id,display_name,headline,bio,county_id,avatar_path,avatar_bucket,cover_photo_path,town,experience_years,skills,education,availability_status,social_links,contact_preferences,is_public")
      .eq("id", account.id)
      .single(),
    supabase.from("counties").select("id,name").order("name"),
    supabase.from("profile_contact_details").select("email,phone").eq("user_id", account.id).maybeSingle(),
    supabase.from("profile_portfolio_items").select("id,title,description,media_type,storage_path,created_at").eq("user_id", account.id).order("created_at", { ascending: false }),
    supabase.from("profile_certificates").select("id,title,issuer,issued_on,credential_url,storage_path,created_at").eq("user_id", account.id).order("issued_on", { ascending: false, nullsFirst: false }),
  ]);
  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
  if (countiesError) throw new Error(`Could not load counties: ${countiesError.message}`);
  if (contactsError) throw new Error(`Could not load your contact preferences: ${contactsError.message}`);
  if (portfolioError) throw new Error(`Could not load your portfolio: ${portfolioError.message}`);
  if (certificatesError) throw new Error(`Could not load your certificates: ${certificatesError.message}`);

  const [avatarUrl, coverUrls, portfolioUrls, certificateUrls] = await Promise.all([
    signAvatarUrls(supabase, [profile]).then((urls) => urls.get(profile.id) ?? null),
    signStoragePaths(supabase, "talantalink-profile-media", [profile.cover_photo_path]),
    signStoragePaths(supabase, "talantalink-profile-media", (portfolio ?? []).map((item) => item.storage_path)),
    signStoragePaths(supabase, "talantalink-profile-media", (certificates ?? []).map((item) => item.storage_path)),
  ]);
  const profileRecord = {
    ...profile,
    avatar_url: avatarUrl,
    cover_photo_url: profile.cover_photo_path ? coverUrls.get(profile.cover_photo_path) ?? null : null,
  } as ProfileRecord;

  return (
    <ProfileEditorForm
      account={account}
      profile={profileRecord}
      counties={counties ?? []}
      contactEmail={contacts?.email ?? ""}
      contactPhone={contacts?.phone ?? ""}
      portfolio={(portfolio ?? []).map((item) => ({ ...item, signed_url: portfolioUrls.get(item.storage_path) ?? null })) as PortfolioItem[]}
      certificates={(certificates ?? []).map((item) => ({
        ...item,
        signed_url: item.storage_path ? certificateUrls.get(item.storage_path) ?? null : null,
      })) as Certificate[]}
    />
  );
}

export default function EditProfilePage() {
  return <Suspense fallback={<main className="auth-page" aria-busy="true" />}>
    <ProfileEditorContent />
  </Suspense>;
}
