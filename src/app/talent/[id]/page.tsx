import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls, signStoragePaths } from "@/lib/storage/signed-urls";
import ShareButton from "@/app/profile/share-button";
import BrandLink from "@/components/brand-link";

const loadProfile = cache(async (id: string) => {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,headline,bio,county_id,avatar_path,avatar_bucket,cover_photo_path,town,experience_years,skills,education,availability_status,social_links,contact_preferences,is_public")
    .eq("id", id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load this talent profile: ${profileError.message}`);
  if (!profile) return null;
  if (!profile.is_public) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError && userError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify access to this talent profile: ${userError.message}`);
    }
    if (user?.id !== id) return null;
  }

  const [
    { data: county, error: countyError },
    { data: portfolio, error: portfolioError },
    { data: certificates, error: certificatesError },
    { data: contacts, error: contactsError },
  ] = await Promise.all([
    profile.county_id
      ? supabase.from("counties").select("name").eq("id", profile.county_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("profile_portfolio_items").select("id,title,description,media_type,storage_path,created_at").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("profile_certificates").select("id,title,issuer,issued_on,credential_url,storage_path,created_at").eq("user_id", id).order("issued_on", { ascending: false, nullsFirst: false }),
    supabase.rpc("get_public_profile_contacts", { target_user_id: id }),
  ]);
  if (countyError) throw new Error(`Could not load this profile's county: ${countyError.message}`);
  if (portfolioError) throw new Error(`Could not load this profile's portfolio: ${portfolioError.message}`);
  if (certificatesError) throw new Error(`Could not load this profile's certificates: ${certificatesError.message}`);
  if (contactsError) throw new Error(`Could not load this profile's contact preferences: ${contactsError.message}`);

  const [avatarUrl, coverUrls, portfolioUrls, certificateUrls] = await Promise.all([
    signAvatarUrls(supabase, [profile]).then((urls) => urls.get(profile.id) ?? null),
    signStoragePaths(supabase, "talantalink-profile-media", [profile.cover_photo_path]),
    signStoragePaths(supabase, "talantalink-profile-media", (portfolio ?? []).map((item) => item.storage_path)),
    signStoragePaths(supabase, "talantalink-profile-media", (certificates ?? []).map((item) => item.storage_path)),
  ]);

  return {
    profile: {
      ...profile,
      avatar_url: avatarUrl,
      cover_photo_url: profile.cover_photo_path ? coverUrls.get(profile.cover_photo_path) ?? null : null,
    },
    countyName: county?.name ?? null,
    portfolio: (portfolio ?? []).map((item) => ({
      ...item,
      url: portfolioUrls.get(item.storage_path)!,
    })),
    certificates: (certificates ?? []).map((certificate) => ({
      ...certificate,
      fileUrl: certificate.storage_path
        ? certificateUrls.get(certificate.storage_path) ?? null
        : null,
    })),
    contacts: contacts?.[0] ?? { email: null, phone: null },
  };
});

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function prettyAvailability(value: string) {
  if (value === "open_to_opportunities") return "Open to opportunities";
  if (value === "unavailable") return "Not currently available";
  return "Available for work";
}

type RouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  const data = await loadProfile(id);
  if (!data) return {
    title: "Talent profile",
    robots: { index: false, follow: false },
  };
  return {
    title: data.profile.display_name,
    description: data.profile.headline || "Discover this Kenyan talent on TalantaLink.",
    openGraph: {
      title: `${data.profile.display_name} | TalantaLink Kenya`,
      description: data.profile.headline || "Discover this Kenyan talent on TalantaLink.",
    },
    robots: data.profile.is_public ? { index: true, follow: true } : { index: false, follow: false },
  };
}

async function TalentProfileContent({ params }: RouteProps) {
  const { id } = await params;
  const data = await loadProfile(id);
  if (!data) notFound();

  const { profile, countyName, portfolio, certificates, contacts } = data;
  const socialLinks = (profile.social_links ?? {}) as Record<string, string>;
  const socialNames: Record<string, string> = {
    website: "Website",
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    facebook: "Facebook",
    linkedin: "LinkedIn",
  };
  const socialEntries = Object.entries(socialNames)
    .map(([key, label]) => ({ key, label, url: safeExternalUrl(socialLinks[key]) }))
    .filter((entry) => entry.url);
  const location = [profile.town, countyName, "Kenya"].filter(Boolean).join(", ");
  const initials = profile.display_name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase();
  const availabilityClass = profile.availability_status === "unavailable" ? "unavailable" : "available";

  return (
    <main className="public-profile-page">
      <header className="public-profile-topbar">
        <BrandLink className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></BrandLink>
        <Link className="outline-button" href="/">Explore the community <span>→</span></Link>
      </header>
      <article className="public-profile">
        {!profile.is_public && <div className="profile-private-banner">This profile is hidden from public visitors.</div>}
        <div className="public-profile-cover" style={profile.cover_photo_url ? { backgroundImage: `linear-gradient(180deg,rgba(16,35,25,.03),rgba(16,35,25,.24)),url("${profile.cover_photo_url}")` } : undefined} />
        <div className="public-profile-heading">
          <div className="public-profile-avatar">
            {profile.avatar_url
              ? <Image src={profile.avatar_url} alt={`${profile.display_name}'s profile picture`} width={128} height={128} unoptimized />
              : <span>{initials}</span>}
          </div>
          <div className="public-profile-identity">
            <p className="eyebrow">TALANTALINK PROFESSIONAL PROFILE</p>
            <h1>{profile.display_name}</h1>
            <p className="public-profile-headline">{profile.headline}</p>
            <p className="public-profile-location">{location}</p>
          </div>
          <div className="public-profile-actions">
            <span className={`availability-pill ${availabilityClass}`}><i />{prettyAvailability(profile.availability_status)}</span>
            {profile.is_public && <ShareButton name={profile.display_name} />}
          </div>
        </div>

        <div className="public-profile-content">
          <div className="public-profile-main">
            {profile.bio && <section className="public-profile-section"><h2>About</h2><p className="public-profile-bio">{profile.bio}</p></section>}
            {(profile.skills?.length > 0 || profile.experience_years !== null) && <section className="public-profile-section">
              <h2>Skills and experience</h2>
              {profile.experience_years !== null && <p className="experience-summary">{profile.experience_years} {profile.experience_years === 1 ? "year" : "years"} of experience</p>}
              <div className="professional-skill-list">{(profile.skills ?? []).map((skill: string) => <span key={skill}>{skill}</span>)}</div>
            </section>}
            {profile.education && <section className="public-profile-section"><h2>Education and qualifications</h2><div className="profile-rich-text">{profile.education.split(/\r?\n/).filter(Boolean).map((line: string, index: number) => <p key={`${index}-${line}`}>{line}</p>)}</div></section>}
            {portfolio.length > 0 && <section className="public-profile-section">
              <h2>Portfolio <span>{portfolio.length}</span></h2>
              <div className="public-portfolio-grid">{portfolio.map((item) => (
                <article className={`public-portfolio-item ${item.media_type}`} key={item.id}>
                  {item.media_type === "photo"
                    ? <a href={item.url} target="_blank" rel="noreferrer"><Image src={item.url} alt={item.title} width={640} height={440} unoptimized /></a>
                    : item.media_type === "video"
                      ? <video src={item.url} controls preload="metadata">{item.title}</video>
                      : <a className="portfolio-document" href={item.url} target="_blank" rel="noreferrer"><span>DOC</span><strong>{item.title}</strong><small>Open document ↗</small></a>}
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                </article>
              ))}</div>
            </section>}
            {certificates.length > 0 && <section className="public-profile-section">
              <h2>Certificates and qualifications <span>{certificates.length}</span></h2>
              <ul className="public-certificate-list">{certificates.map((certificate) => {
                const credentialUrl = safeExternalUrl(certificate.credential_url);
                return <li key={certificate.id}>
                  <span className="certificate-mark">✓</span>
                  <span><strong>{certificate.title}</strong><small>{[certificate.issuer, certificate.issued_on].filter(Boolean).join(" · ")}</small></span>
                  {certificate.fileUrl && <a href={certificate.fileUrl} target="_blank" rel="noreferrer">Certificate ↗</a>}
                  {credentialUrl && <a href={credentialUrl} target="_blank" rel="noreferrer">Verify ↗</a>}
                </li>;
              })}</ul>
            </section>}
          </div>

          <aside className="public-profile-aside">
            <section className="public-profile-section profile-quick-facts">
              <h2>At a glance</h2>
              <dl>
                <div><dt>Location</dt><dd>{location}</dd></div>
                <div><dt>Experience</dt><dd>{profile.experience_years === null ? "Not specified" : `${profile.experience_years} ${profile.experience_years === 1 ? "year" : "years"}`}</dd></div>
                <div><dt>Availability</dt><dd>{prettyAvailability(profile.availability_status)}</dd></div>
              </dl>
            </section>
            {(contacts.email || contacts.phone || profile.contact_preferences?.includes("in_app")) && <section className="public-profile-section profile-contact-card">
              <h2>Contact</h2>
              {profile.contact_preferences?.includes("in_app") && <p>Open to messages through TalantaLink.</p>}
              {contacts.email && <a href={`mailto:${contacts.email}`}>{contacts.email}</a>}
              {contacts.phone && profile.contact_preferences?.includes("phone") && <a href={`tel:${contacts.phone}`}>{contacts.phone}</a>}
              {contacts.phone && profile.contact_preferences?.includes("whatsapp") && <a href={`https://wa.me/${contacts.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Message on WhatsApp</a>}
            </section>}
            {socialEntries.length > 0 && <section className="public-profile-section">
              <h2>Find me online</h2>
              <ul className="public-social-list">{socialEntries.map((entry) => <li key={entry.key}><a href={entry.url!} target="_blank" rel="noreferrer">{entry.label}<span>↗</span></a></li>)}</ul>
            </section>}
          </aside>
        </div>
        <footer className="public-profile-footer">A professional profile on <Link href="/">TalantaLink Kenya</Link></footer>
      </article>
    </main>
  );
}

async function ConnectionMarker() {
  await connection();
  return null;
}

function DynamicMarker() {
  return <Suspense fallback={null}><ConnectionMarker /></Suspense>;
}

export default function TalentProfilePage({ params }: RouteProps) {
  return <>
    <Suspense fallback={<main className="public-profile-page" aria-busy="true" />}>
      <TalentProfileContent params={params} />
    </Suspense>
    <DynamicMarker />
  </>;
}
