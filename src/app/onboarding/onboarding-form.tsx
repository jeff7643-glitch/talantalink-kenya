"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthenticatedProfile } from "@/lib/auth/dal";
import { getErrorMessage } from "@/lib/error-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import BrandLink from "@/components/brand-link";

type County = { id: number; name: string };
type ProfileDetails = {
  display_name: string;
  headline: string;
  bio: string;
  county_id: number | null;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_bucket: string;
};

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export default function OnboardingForm({
  account,
  profile,
  counties,
}: {
  account: AuthenticatedProfile;
  profile: ProfileDetails;
  counties: County[];
}) {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!imageExtensions[file.type]) {
      setError("Choose a JPEG, PNG, WebP or AVIF profile photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a profile photo smaller than 5 MB.");
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const countyId = Number(formData.get("countyId"));
    if (!displayName || !headline || !countyId) {
      setError("Add your name, professional headline and county to continue.");
      return;
    }

    setBusy(true);
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let uploadedPath: string | null = null;
    try {
      supabase = createSupabaseBrowserClient();
      let avatarPath = profile.avatar_path;
      let avatarBucket = profile.avatar_bucket;
      if (photo) {
        const extension = imageExtensions[photo.type];
        uploadedPath = `${account.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("talantalink-profile-media")
          .upload(uploadedPath, photo, { contentType: photo.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        avatarPath = uploadedPath;
        avatarBucket = "talantalink-profile-media";
      }

      const { error: profileError } = await supabase.from("profiles").update({
        display_name: displayName,
        headline,
        bio,
        county_id: countyId,
        avatar_url: null,
        avatar_path: avatarPath,
        avatar_bucket: avatarBucket,
        onboarding_complete: true,
      }).eq("id", account.id).select("id").single();
      if (profileError) throw profileError;
      uploadedPath = null;
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      let message = getErrorMessage(caught, "Could not finish setting up your profile.");
      if (uploadedPath && supabase) {
        const { error: cleanupError } = await supabase.storage.from("talantalink-profile-media").remove([uploadedPath]);
        if (cleanupError) message += ` The uploaded profile photo could not be removed: ${cleanupError.message}`;
      }
      setError(message);
      setBusy(false);
    }
  }

  const image = preview ?? profile.avatar_url;

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <BrandLink className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></BrandLink>
      </header>
      <section className="auth-card onboarding-card">
        <p className="eyebrow">YOUR TALENT, YOUR STORY</p>
        <h1>Let the community know you.</h1>
        <p className="auth-subtitle">Complete the essentials so members can find your work and opportunities.</p>
        <div className="onboarding-role"><span>Your account type</span><strong>{account.role[0].toUpperCase() + account.role.slice(1)}</strong></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label className="onboarding-photo-label">Profile photo <span>Optional · JPEG, PNG, WebP or AVIF, up to 5 MB</span>
            <input className="onboarding-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => choosePhoto(event.target.files?.[0])} />
            <span className="onboarding-photo">
              {image ? <Image src={image} alt="Profile photo preview" width={72} height={72} unoptimized /> : <span>{profile.display_name.slice(0, 1).toUpperCase()}</span>}
              <span>{image ? "Choose a different photo" : "Choose a photo"}</span>
            </span>
          </label>
          <label>Your name<input name="displayName" required maxLength={100} defaultValue={profile.display_name === "New talent" ? "" : profile.display_name} autoComplete="name" /></label>
          <label>Professional headline<input name="headline" required maxLength={160} defaultValue={profile.headline} placeholder="e.g. Footballer, photographer or recruiter" /></label>
          <label>County<select name="countyId" required defaultValue={profile.county_id ?? ""}><option value="" disabled>Select your county</option>{counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}</select></label>
          <label>About you <span>Optional</span><textarea name="bio" maxLength={2000} rows={4} defaultValue={profile.bio} placeholder="Share your experience, interests and what you’re looking for." /></label>
          <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? "Saving profile..." : "Complete profile"} <span>→</span></button>
        </form>
      </section>
    </main>
  );
}
