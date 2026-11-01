"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import type { AuthenticatedProfile } from "@/lib/auth/dal";
import { getErrorMessage } from "@/lib/error-message";
import { kenyanTowns, normalizeKenyanPhone } from "@/lib/kenya";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import BrandLink from "@/components/brand-link";

export type ProfileRecord = {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  county_id: number | null;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_bucket: string;
  cover_photo_url: string | null;
  cover_photo_path: string | null;
  town: string | null;
  experience_years: number | null;
  skills: string[];
  education: string;
  availability_status: "available" | "open_to_opportunities" | "unavailable";
  social_links: Record<string, string>;
  contact_preferences: string[];
  is_public: boolean;
};

export type PortfolioItem = {
  id: string;
  title: string;
  description: string;
  media_type: "photo" | "video" | "document";
  storage_path: string;
  signed_url?: string | null;
  created_at: string;
};

export type Certificate = {
  id: string;
  title: string;
  issuer: string;
  issued_on: string | null;
  credential_url: string | null;
  storage_path: string | null;
  signed_url?: string | null;
  created_at: string;
};

type County = { id: number; name: string };
type QueuedFile = { file: File; title: string; description: string };
type QueuedCertificate = { file: File | null; title: string; issuer: string; issuedOn: string; credentialUrl: string };

const bucket = "talantalink-profile-media";
const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const mediaTypes: Record<string, { extension: string; type: PortfolioItem["media_type"] }> = {
  ...Object.fromEntries(Object.entries(imageTypes).map(([mime, extension]) => [mime, { extension, type: "photo" as const }])),
  "video/mp4": { extension: "mp4", type: "video" },
  "video/webm": { extension: "webm", type: "video" },
  "application/pdf": { extension: "pdf", type: "document" },
  "application/msword": { extension: "doc", type: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx", type: "document" },
};
const socialPlatforms = [
  ["website", "Website"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
] as const;
const contactOptions = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["whatsapp", "WhatsApp"],
  ["in_app", "TalantaLink messages"],
] as const;

function isValidUpload(file: File, acceptedTypes: Record<string, string | { extension: string; type: string }>, maxSize: number) {
  return Boolean(acceptedTypes[file.type]) && file.size > 0 && file.size <= maxSize;
}

function fileExtension(file: File) {
  const mapped = mediaTypes[file.type];
  if (mapped) return mapped.extension;
  return imageTypes[file.type];
}

export default function ProfileEditorForm({
  account,
  profile,
  counties,
  contactEmail,
  contactPhone,
  portfolio,
  certificates,
}: {
  account: AuthenticatedProfile;
  profile: ProfileRecord;
  counties: County[];
  contactEmail: string;
  contactPhone: string;
  portfolio: PortfolioItem[];
  certificates: Certificate[];
}) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<QueuedFile[]>([]);
  const [certificateDraft, setCertificateDraft] = useState<QueuedCertificate>({
    file: null,
    title: "",
    issuer: "",
    issuedOn: "",
    credentialUrl: "",
  });
  const [newCertificates, setNewCertificates] = useState<QueuedCertificate[]>([]);
  const [portfolioItems, setPortfolioItems] = useState(portfolio);
  const [savedCertificates, setSavedCertificates] = useState(certificates);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [avatarPreview, coverPreview]);

  function chooseImage(event: ChangeEvent<HTMLInputElement>, kind: "avatar" | "cover") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isValidUpload(file, imageTypes, 5 * 1024 * 1024)) {
      setError("Choose a JPEG, PNG, WebP or AVIF image smaller than 5 MB.");
      event.target.value = "";
      return;
    }
    if (kind === "avatar") {
      setAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    } else {
      setCover(file);
      setCoverPreview(URL.createObjectURL(file));
    }
    setError("");
  }

  function addPortfolioFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const invalid = selected.find((file) => !isValidUpload(file, mediaTypes, 20 * 1024 * 1024));
    if (invalid) {
      setError(`${invalid.name} is not a supported file or is larger than 20 MB.`);
      event.target.value = "";
      return;
    }
    if (portfolioItems.length + portfolioFiles.length + selected.length > 12) {
      setError("A profile can include up to 12 portfolio items.");
      event.target.value = "";
      return;
    }
    setPortfolioFiles((items) => [...items, ...selected.map((file) => ({
      file,
      title: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
      description: "",
    }))]);
    event.target.value = "";
    setError("");
  }

  function addCertificate() {
    const title = certificateDraft.title.trim();
    if (!title) {
      setError("Add a certificate or qualification name.");
      return;
    }
    if (!certificateDraft.file && !certificateDraft.credentialUrl.trim()) {
      setError("Attach a certificate document or add its verification link.");
      return;
    }
    if (certificateDraft.file && !isValidUpload(certificateDraft.file, mediaTypes, 20 * 1024 * 1024)) {
      setError("Choose a supported certificate document smaller than 20 MB.");
      return;
    }
    setNewCertificates((items) => [...items, { ...certificateDraft, title }]);
    setCertificateDraft({ file: null, title: "", issuer: "", issuedOn: "", credentialUrl: "" });
    const input = document.getElementById("certificate-file") as HTMLInputElement | null;
    if (input) input.value = "";
    setError("");
  }

  async function removeItem(kind: "portfolio" | "certificate", id: string, storagePath: string | null) {
    setError("");
    setNotice("");
    const supabase = createSupabaseBrowserClient();
    const result = kind === "portfolio"
      ? await supabase.from("profile_portfolio_items").delete().eq("id", id).eq("user_id", account.id)
      : await supabase.from("profile_certificates").delete().eq("id", id).eq("user_id", account.id);
    if (result.error) {
      setError(`Could not remove this ${kind === "portfolio" ? "portfolio item" : "certificate"}: ${result.error.message}`);
      return;
    }
    if (kind === "portfolio") setPortfolioItems((items) => items.filter((item) => item.id !== id));
    else setSavedCertificates((items) => items.filter((item) => item.id !== id));
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from(bucket).remove([storagePath]);
      if (storageError) setNotice(`The item was removed from your profile, but its stored file could not be deleted: ${storageError.message}`);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const formData = new FormData(event.currentTarget);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const countyId = Number(formData.get("countyId"));
    const town = String(formData.get("town") ?? "").trim();
    const experienceInput = String(formData.get("experienceYears") ?? "").trim();
    const experienceYears = experienceInput === "" ? null : Number(experienceInput);
    const skills = String(formData.get("skills") ?? "")
      .split(/[,\n]/)
      .map((skill) => skill.trim())
      .filter(Boolean);
    const contactPreferences = formData.getAll("contactPreferences").map(String);
    const email = String(formData.get("contactEmail") ?? "").trim();
    const phoneInput = String(formData.get("contactPhone") ?? "").trim();
    const phone = phoneInput ? normalizeKenyanPhone(phoneInput) : null;

    if (!displayName || !headline || !countyId) {
      setError("Your full name, professional headline and county are required.");
      return;
    }
    if (contactPreferences.some((preference) => !contactOptions.some(([allowed]) => allowed === preference))) {
      setError("Choose valid contact preferences.");
      return;
    }
    if (experienceYears !== null && (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80)) {
      setError("Enter years of experience from 0 to 80.");
      return;
    }
    if (skills.length > 30 || skills.some((skill) => skill.length > 80)) {
      setError("Add no more than 30 skills, with up to 80 characters per skill.");
      return;
    }
    if (contactPreferences.includes("email") && !email) {
      setError("Add an email address or remove email from your contact preferences.");
      return;
    }
    if (phoneInput && !phone) {
      setError("Enter a valid Kenyan mobile number, such as +254 712 345 678.");
      return;
    }
    if ((contactPreferences.includes("phone") || contactPreferences.includes("whatsapp")) && !phone) {
      setError("Add a valid Kenyan mobile number or remove phone and WhatsApp from your contact preferences.");
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const uploadedPaths: string[] = [];
    const committedPaths = new Set<string>();
    let profileSaved = false;

    async function upload(file: File) {
      const path = `${account.id}/${crypto.randomUUID()}.${fileExtension(file)}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      return path;
    }

    try {
      const avatarPath = avatar ? await upload(avatar) : null;
      const coverPath = cover ? await upload(cover) : null;

      const socialLinks = Object.fromEntries(
        socialPlatforms
          .map(([key]) => [key, String(formData.get(`social_${key}`) ?? "").trim()])
          .filter(([, value]) => Boolean(value)),
      );
      const { error: profileError } = await supabase.from("profiles").update({
        display_name: displayName,
        headline,
        bio: String(formData.get("bio") ?? "").trim(),
        county_id: countyId,
        town: town || null,
        avatar_url: null,
        avatar_path: avatarPath ?? profile.avatar_path,
        avatar_bucket: avatarPath ? bucket : profile.avatar_bucket,
        cover_photo_url: null,
        cover_photo_path: coverPath ?? profile.cover_photo_path,
        experience_years: experienceYears,
        skills,
        education: String(formData.get("education") ?? "").trim(),
        availability_status: String(formData.get("availabilityStatus")),
        social_links: socialLinks,
        contact_preferences: contactPreferences,
        is_public: formData.get("isPublic") === "on",
        onboarding_complete: true,
      }).eq("id", account.id);
      if (profileError) throw profileError;
      profileSaved = true;
      if (avatarPath) committedPaths.add(avatarPath);
      if (coverPath) committedPaths.add(coverPath);

      const { error: contactError } = await supabase.from("profile_contact_details").upsert({
        user_id: account.id,
        email: email || null,
        phone,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (contactError) throw contactError;

      const savedPortfolio: Array<{
        user_id: string;
        title: string;
        description: string;
        media_type: PortfolioItem["media_type"];
        storage_path: string;
      }> = [];
      for (const item of portfolioFiles) {
        const path = await upload(item.file);
        const mediaType = mediaTypes[item.file.type]?.type;
        if (!mediaType) throw new Error(`Unsupported portfolio media type: ${item.file.type}`);
        savedPortfolio.push({ user_id: account.id, title: item.title.trim(), description: item.description.trim(), media_type: mediaType, storage_path: path });
      }
      if (savedPortfolio.length) {
        const { error: portfolioError } = await supabase.from("profile_portfolio_items").insert(savedPortfolio);
        if (portfolioError) throw portfolioError;
        savedPortfolio.forEach((item) => committedPaths.add(item.storage_path));
      }

      const savedCertificateRows = [];
      for (const certificate of newCertificates) {
        const path = certificate.file ? await upload(certificate.file) : null;
        savedCertificateRows.push({
          user_id: account.id,
          title: certificate.title,
          issuer: certificate.issuer.trim(),
          issued_on: certificate.issuedOn || null,
          credential_url: certificate.credentialUrl.trim() || null,
          storage_path: path,
        });
      }
      if (savedCertificateRows.length) {
        const { error: certificateError } = await supabase.from("profile_certificates").insert(savedCertificateRows);
        if (certificateError) throw certificateError;
        savedCertificateRows.forEach((certificate) => {
          if (certificate.storage_path) committedPaths.add(certificate.storage_path);
        });
      }

      router.push(`/talent/${account.id}`);
      router.refresh();
    } catch (caught) {
      const unreferencedPaths = uploadedPaths.filter((path) => !committedPaths.has(path));
      if (unreferencedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(bucket).remove(unreferencedPaths);
        if (cleanupError) {
          setNotice(`Some uploaded files could not be cleaned up: ${cleanupError.message}`);
        }
      }
      const message = getErrorMessage(caught, "Could not save your profile.");
      setError(profileSaved ? `Your profile details were saved, but a portfolio or certificate update failed: ${message}` : message);
      setBusy(false);
    }
  }

  const availabilityOptions = [
    ["available", "Available for work"],
    ["open_to_opportunities", "Open to opportunities"],
    ["unavailable", "Not currently available"],
  ] as const;

  return (
    <main className="auth-page profile-editor-page">
      <header className="auth-topbar">
        <BrandLink className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></BrandLink>
        <Link className="outline-button" href={`/talent/${account.id}`}>Preview profile</Link>
      </header>
      <section className="profile-editor-shell">
        <p className="eyebrow">YOUR TALENT, YOUR STORY</p>
        <h1>Build your professional profile</h1>
        <p className="auth-subtitle">Help Kenya’s community and opportunity providers understand what you do best.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-success" role="status">{notice}</div>}
        <form className="professional-profile-form" onSubmit={(event) => void submit(event)}>
          <section className="profile-form-section">
            <h2>Profile identity</h2>
            <p>Introduce yourself and show people where you are based.</p>
            <label className="profile-cover-picker">
              <span className="profile-cover-preview" style={{ backgroundImage: coverPreview ? `url("${coverPreview}")` : profile.cover_photo_url ? `url("${profile.cover_photo_url}")` : undefined }}>
                {!coverPreview && !profile.cover_photo_url && <span>Add a cover photo</span>}
              </span>
              <span>Cover photo <small>JPEG, PNG, WebP or AVIF · up to 5 MB</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => chooseImage(event, "cover")} />
            </label>
            <label className="profile-avatar-picker">
              {avatarPreview || profile.avatar_url
                ? <Image src={avatarPreview ?? profile.avatar_url!} alt="Profile photo preview" width={76} height={76} unoptimized />
                : <span className="profile-avatar-placeholder">{profile.display_name.slice(0, 1).toUpperCase()}</span>}
              <span>Profile picture <small>Choose a clear, recent photo</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => chooseImage(event, "avatar")} />
            </label>
            <div className="profile-fields-grid">
              <label>Full name<input name="displayName" required maxLength={100} defaultValue={profile.display_name} autoComplete="name" /></label>
              <label>Professional headline<input name="headline" required maxLength={160} defaultValue={profile.headline} placeholder="e.g. Footballer, filmmaker or artisan" /></label>
              <label>County in Kenya<select name="countyId" required defaultValue={profile.county_id ?? ""}><option value="" disabled>Select county</option>{counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}</select></label>
              <label>Town<input name="town" maxLength={120} defaultValue={profile.town ?? ""} placeholder="e.g. Kisumu" autoComplete="address-level2" list="kenyan-towns" /></label>
              <datalist id="kenyan-towns">{kenyanTowns.map((town) => <option key={town} value={town} />)}</datalist>
            </div>
            <label>Biography<textarea name="bio" maxLength={2000} rows={5} defaultValue={profile.bio} placeholder="Tell people about your journey, strengths and the work you’re proud of." /></label>
          </section>

          <section className="profile-form-section">
            <h2>Skills and experience</h2>
            <p>Describe your strengths and the experience behind your work.</p>
            <label>Skills and talents <small>Separate each skill with a comma or a new line.</small><textarea name="skills" maxLength={2500} rows={3} defaultValue={profile.skills.join(", ")} placeholder="e.g. Football, coaching, event leadership" /></label>
            <div className="profile-fields-grid">
              <label>Years of experience<input name="experienceYears" type="number" min="0" max="80" step="1" defaultValue={profile.experience_years ?? ""} placeholder="e.g. 5" /></label>
              <label>Availability<select name="availabilityStatus" defaultValue={profile.availability_status}>{availabilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label>Education and qualifications <small>Add one qualification per line.</small><textarea name="education" maxLength={4000} rows={4} defaultValue={profile.education} placeholder="Institution · qualification · year" /></label>
          </section>

          <section className="profile-form-section">
            <h2>Portfolio</h2>
            <p>Showcase up to 12 photos, videos and documents. Each file can be up to 20 MB.</p>
            {portfolioItems.length > 0 && <ul className="profile-media-list">{portfolioItems.map((item) => (
              <li key={item.id}><span><strong>{item.title}</strong><small>{item.media_type} · saved{item.signed_url ? <> · <a href={item.signed_url} target="_blank" rel="noreferrer">Preview</a></> : null}</small></span><button type="button" className="text-button" onClick={() => void removeItem("portfolio", item.id, item.storage_path)}>Remove</button></li>
            ))}</ul>}
            {portfolioFiles.map((item, index) => (
              <div className="profile-queued-file" key={`${item.file.name}-${item.file.lastModified}`}>
                <label>Portfolio title<input value={item.title} maxLength={160} onChange={(event) => setPortfolioFiles((files) => files.map((file, fileIndex) => fileIndex === index ? { ...file, title: event.target.value } : file))} /></label>
                <label>Description<input value={item.description} maxLength={1000} onChange={(event) => setPortfolioFiles((files) => files.map((file, fileIndex) => fileIndex === index ? { ...file, description: event.target.value } : file))} /></label>
                <span>{item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" className="text-button" onClick={() => setPortfolioFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
              </div>
            ))}
            <label className="profile-file-input">Add portfolio files<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={addPortfolioFiles} /></label>
          </section>

          <section className="profile-form-section">
            <h2>Certificates and qualifications</h2>
            <p>Add credentials people can review, with an optional certificate file or verification link.</p>
            {savedCertificates.length > 0 && <ul className="profile-media-list">{savedCertificates.map((certificate) => (
              <li key={certificate.id}><span><strong>{certificate.title}</strong><small>{[certificate.issuer, certificate.issued_on].filter(Boolean).join(" · ") || "Certificate"}{certificate.signed_url ? <> · <a href={certificate.signed_url} target="_blank" rel="noreferrer">Preview</a></> : null}</small></span><button type="button" className="text-button" onClick={() => void removeItem("certificate", certificate.id, certificate.storage_path)}>Remove</button></li>
            ))}</ul>}
            {newCertificates.map((certificate, index) => <div className="profile-queued-file" key={`${certificate.title}-${index}`}>
              <span><strong>{certificate.title}</strong><small>{certificate.issuer || "Certificate"}{certificate.file ? ` · ${certificate.file.name}` : ""}</small></span>
              <button type="button" className="text-button" onClick={() => setNewCertificates((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>)}
            <div className="profile-fields-grid">
              <label>Certificate or qualification<input value={certificateDraft.title} maxLength={160} onChange={(event) => setCertificateDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="e.g. First Aid Certification" /></label>
              <label>Issuing institution<input value={certificateDraft.issuer} maxLength={160} onChange={(event) => setCertificateDraft((draft) => ({ ...draft, issuer: event.target.value }))} /></label>
              <label>Date issued<input type="date" value={certificateDraft.issuedOn} onChange={(event) => setCertificateDraft((draft) => ({ ...draft, issuedOn: event.target.value }))} /></label>
              <label>Verification link<input type="url" maxLength={2000} value={certificateDraft.credentialUrl} onChange={(event) => setCertificateDraft((draft) => ({ ...draft, credentialUrl: event.target.value }))} placeholder="https://" /></label>
            </div>
            <label className="profile-file-input">Certificate file <small>PDF, Word document or supported media · up to 20 MB</small><input id="certificate-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setCertificateDraft((draft) => ({ ...draft, file: event.target.files?.[0] ?? null }))} /></label>
            {certificateDraft.file && <p className="profile-file-note">Selected: {certificateDraft.file.name}</p>}
            <button type="button" className="outline-button" onClick={addCertificate}>Add certificate</button>
          </section>

          <section className="profile-form-section">
            <h2>Contact and social links</h2>
            <p>Choose which contact details to share on your public profile. WhatsApp is shown only when you opt in.</p>
            <div className="profile-contact-options">{contactOptions.map(([value, label]) => (
              <label key={value}><input type="checkbox" name="contactPreferences" value={value} defaultChecked={profile.contact_preferences.includes(value)} />{label}</label>
            ))}</div>
            <div className="profile-fields-grid">
              <label>Contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={contactEmail} autoComplete="email" /></label>
              <label>Kenyan mobile number<input name="contactPhone" type="tel" maxLength={32} defaultValue={contactPhone} autoComplete="tel" inputMode="tel" placeholder="+254 712 345 678" /></label>
            </div>
            <p className="profile-private-note">Your email and phone stay private unless you select them above. WhatsApp contact is shown only with your explicit consent. Numbers are saved in +254 format.</p>
            <h3>Social media</h3>
            <div className="profile-fields-grid">
              {socialPlatforms.map(([key, label]) => <label key={key}>{label}<input name={`social_${key}`} type="url" maxLength={2000} defaultValue={profile.social_links[key] ?? ""} placeholder="https://" /></label>)}
            </div>
          </section>

          <section className="profile-form-section profile-visibility">
            <div><h2>Public profile link</h2><p>{profile.is_public ? "Anyone with your link can see your profile." : "Your profile is currently hidden from public visitors."}</p></div>
            <label><input type="checkbox" name="isPublic" defaultChecked={profile.is_public} /> Make my profile public</label>
          </section>
          <div className="profile-form-actions">
            <Link className="outline-button" href="/dashboard">Cancel</Link>
            <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving profile..." : "Save professional profile"} <span>→</span></button>
          </div>
        </form>
      </section>
    </main>
  );
}
