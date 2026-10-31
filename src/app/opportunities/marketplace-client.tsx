"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import type { AuthenticatedProfile } from "@/lib/auth/dal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createOpportunity,
  registerApplicationDocument,
  submitApplication,
  updateApplicationStatus,
  updateOpportunityStatus,
  withdrawApplication,
} from "./actions";
import type { MarketplaceActionState } from "./actions";
import { useActionState } from "react";
import styles from "./opportunities.module.css";
import { kenyanTowns } from "@/lib/kenya";

const categories = [
  ["all", "All opportunities"],
  ["job", "Jobs"],
  ["audition", "Auditions"],
  ["internship", "Internships"],
  ["competition", "Competitions"],
  ["freelance_gig", "Freelance gigs"],
  ["sponsorship", "Sponsorships"],
] as const;
const acceptedFiles = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const labels: Record<string, string> = {
  job: "Job vacancy",
  audition: "Audition",
  internship: "Internship",
  competition: "Competition",
  freelance_gig: "Freelance gig",
  sponsorship: "Sponsorship",
};

type Listing = {
  id: string;
  title: string;
  description: string;
  requirements: string;
  type: string;
  location: string;
  compensation: string | null;
  deadline: string;
  contact_email: string;
  created_at: string;
  status: string;
  company_id: string;
  companies: { name: string } | { name: string }[] | null;
};
type Application = {
  id: string;
  opportunity_id: string;
  status: string;
  message: string;
  created_at: string;
  opportunities: { title: string } | { title: string }[] | null;
};
type ReceivedApplication = {
  id: string;
  opportunity_id: string;
  applicant_id: string;
  status: string;
  message: string;
  created_at: string;
  applicant: { id: string; display_name: string; headline: string } | null;
  documents: { document_type: string; file_name: string; signed_url: string | null }[];
};

function companyName(listing: Listing) {
  const company = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
  return company?.name ?? "TalantaLink opportunity";
}

function opportunityName(application: Application) {
  const opportunity = Array.isArray(application.opportunities) ? application.opportunities[0] : application.opportunities;
  return opportunity?.title ?? "Opportunity";
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(deadline));
}

function fileExtension(file: File) {
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return extensions[file.type];
}

function ActionFeedback({ state }: { state: MarketplaceActionState }) {
  if (state.error) return <p className={styles.error} role="alert">{state.error}</p>;
  if (state.notice) return <p className={styles.success} role="status">{state.notice}</p>;
  return null;
}

export default function OpportunitiesMarketplace({
  account,
  listings,
  applications,
  ownedOpportunities,
  receivedApplications,
}: {
  account: AuthenticatedProfile;
  listings: Listing[];
  applications: Application[];
  ownedOpportunities: Listing[];
  receivedApplications: ReceivedApplication[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"discover" | "manage">("discover");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, startUpload] = useTransition();
  const isEmployer = ["employer", "recruiter", "administrator"].includes(account.role);
  const [createState, createAction, isCreating] = useActionState(createOpportunity, {});
  const [statusState, statusAction, isUpdating] = useActionState(
    (_state: MarketplaceActionState, formData: FormData) => updateApplicationStatus(formData),
    {},
  );
  const [listingState, listingAction, isUpdatingListing] = useActionState(
    (_state: MarketplaceActionState, formData: FormData) => updateOpportunityStatus(formData),
    {},
  );
  const [withdrawState, withdrawAction, isWithdrawing] = useActionState(
    (_state: MarketplaceActionState, formData: FormData) => withdrawApplication(formData),
    {},
  );
  const filteredListings = useMemo(() => listings.filter((listing) => {
    const matchesCategory = category === "all" || listing.type === category;
    const text = `${listing.title} ${listing.description} ${listing.requirements} ${listing.location} ${companyName(listing)}`.toLowerCase();
    return matchesCategory && text.includes(search.toLowerCase());
  }), [category, listings, search]);

  async function apply(event: FormEvent<HTMLFormElement>, opportunityId: string) {
    event.preventDefault();
    setUploadError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const cv = formData.get("cv");
    const portfolio = formData.get("portfolio");
    if (!(cv instanceof File) || !cv.size) {
      setUploadError("Attach your CV or résumé to apply.");
      return;
    }
    const files = [
      { type: "cv", file: cv },
      ...(portfolio instanceof File && portfolio.size ? [{ type: "portfolio", file: portfolio }] : []),
    ];
    if (files.some(({ file }) => !acceptedFiles.has(file.type) || file.size > 15 * 1024 * 1024)) {
      setUploadError("Use a PDF, DOC, DOCX, JPEG, PNG or WebP file up to 15 MB.");
      return;
    }

    startUpload(async () => {
      const uploadedPaths: string[] = [];
      let applicationId: string | null = null;
      let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
      try {
        const submission = new FormData();
        submission.set("opportunityId", opportunityId);
        submission.set("message", String(formData.get("message") ?? ""));
        const application = await submitApplication(submission);
        const newApplicationId = application.applicationId;
        applicationId = newApplicationId;
        supabase = createSupabaseBrowserClient();
        for (const item of files) {
          const path = `${account.id}/${newApplicationId}/${crypto.randomUUID()}.${fileExtension(item.file)}`;
          const { error } = await supabase.storage
            .from("talantalink-application-files")
            .upload(path, item.file, { contentType: item.file.type, upsert: false });
          if (error) throw error;
          uploadedPaths.push(path);
          const documentData = new FormData();
          documentData.set("applicationId", newApplicationId);
          documentData.set("documentType", item.type);
          documentData.set("fileName", item.file.name.slice(0, 180));
          documentData.set("storagePath", path);
          documentData.set("mimeType", item.file.type);
          const result = await registerApplicationDocument(documentData);
          if (result.error) throw new Error(result.error);
        }
        form.reset();
        router.refresh();
      } catch (error) {
        let message = error instanceof Error ? error.message : "Could not submit your application.";
        if (applicationId) {
          const cleanup = new FormData();
          cleanup.set("applicationId", applicationId);
          uploadedPaths.forEach((path) => cleanup.append("uploadedPath", path));
          const result = await withdrawApplication(cleanup);
          if (result.error) message += ` Cleanup failed: ${result.error}`;
        }
        setUploadError(message);
      }
    });
  }

  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>MAKE YOUR NEXT MOVE</p>
        <h1>Find the work that<br /><span>moves you forward.</span></h1>
        <p className={styles.heroCopy}>Local jobs, internships and creative opportunities across Kenya. Discover your next role, audition, gig, competition or sponsor.</p>
        <div className={styles.heroStats}>
          <div><strong>{listings.length.toLocaleString("en-KE")}</strong><span>open opportunities</span></div>
          <i />
          <div><strong>47</strong><span>counties, one community</span></div>
        </div>
        <div className={styles.heroShape} aria-hidden="true">✳</div>
      </section>

      <div className={styles.content}>
        {isEmployer && (
          <div className={styles.roleBanner}>
            <div><span className={styles.roleDot} /><p><strong>Hiring on TalantaLink</strong><br />Create a draft or publish an opportunity for Kenya’s talent community.</p></div>
            <button type="button" className={styles.primaryButton} onClick={() => setActiveTab("manage")}>Post an opportunity <span>＋</span></button>
          </div>
        )}

        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>YOUR NEXT OPPORTUNITY</p><h2>Explore the marketplace</h2></div>
          {account.role === "talent" && <span className={styles.statusSummary}>{applications.length} application{applications.length === 1 ? "" : "s"} submitted</span>}
        </div>

        {account.role === "talent" && applications.length > 0 && (
          <section className={styles.applicationPanel}>
            <div className={styles.applicationPanelTitle}><div><p className={styles.eyebrow}>KEEP TRACK</p><h3>Your applications</h3></div><span>{applications.length}</span></div>
            <div className={styles.applicationRows}>
              {applications.map((application) => (
                <article className={styles.applicationRow} key={application.id}>
                  <div><strong>{opportunityName(application)}</strong><span>Applied {formatDeadline(application.created_at)}</span></div>
                  <span className={`${styles.applicationStatus} ${styles[`status_${application.status}`] ?? ""}`}>{application.status}</span>
                  {application.status === "submitted" && <form action={withdrawAction}><input type="hidden" name="applicationId" value={application.id} /><button className={styles.textButton} type="submit" disabled={isWithdrawing}>Withdraw</button></form>}
                </article>
              ))}
            </div>
            <ActionFeedback state={withdrawState} />
          </section>
        )}

        {isEmployer && <div className={styles.tabs}>
          <button type="button" className={activeTab === "discover" ? styles.selectedTab : ""} onClick={() => setActiveTab("discover")}>Discover opportunities</button>
          <button type="button" className={activeTab === "manage" ? styles.selectedTab : ""} onClick={() => setActiveTab("manage")}>Manage listings <span>{ownedOpportunities.length}</span></button>
        </div>}

        {isEmployer && activeTab === "manage" ? (
          <div className={styles.manageGrid}>
            <section className={styles.createPanel}>
              <p className={styles.eyebrow}>GROW YOUR TEAM</p><h3>Post an opportunity</h3>
              <p className={styles.panelIntro}>Draft a listing for later or publish it now for members to find.</p>
              <form action={createAction} className={styles.createForm}>
                <label>Company or organizer name<input name="companyName" required maxLength={160} placeholder="e.g. Nairobi Creative Studio" /></label>
                <label>Opportunity title<input name="title" required maxLength={160} placeholder="e.g. Junior sports photographer" /></label>
                <div className={styles.formPair}>
                  <label>Type<select name="type" required defaultValue="job">{categories.slice(1).map(([value, label]) => <option value={value} key={value}>{label.slice(0, -1)}</option>)}</select></label>
                  <label>Location<input name="location" required maxLength={200} placeholder="Nairobi, Mombasa, Kisumu or remote" list="kenyan-opportunity-towns" /></label>
                </div>
                <datalist id="kenyan-opportunity-towns">{kenyanTowns.map((town) => <option key={town} value={town} />)}</datalist>
                <label>Description<textarea name="description" rows={4} maxLength={5000} required placeholder="What will the successful applicant do?" /></label>
                <label>Requirements<textarea name="requirements" rows={3} maxLength={5000} required placeholder="Skills, experience, eligibility or materials required." /></label>
                <div className={styles.formPair}>
                  <label>Compensation in KES <span>Required for jobs, internships, gigs & sponsorships</span><input name="compensation" maxLength={500} placeholder="e.g. KES 45,000 per month" /></label>
                  <label>Application deadline<input name="deadline" type="date" min={new Date().toISOString().slice(0, 10)} required /></label>
                </div>
                <label>Contact email<input name="contactEmail" type="email" required maxLength={254} placeholder="recruitment@example.com" /></label>
                <label>Save as<select name="status" defaultValue="published"><option value="published">Publish now</option><option value="draft">Save draft</option></select></label>
                <ActionFeedback state={createState} />
                <button className={styles.primaryButton} type="submit" disabled={isCreating}>{isCreating ? "Saving…" : "Save opportunity"} <span>→</span></button>
              </form>
            </section>
            <section className={styles.listingsPanel}>
              <div className={styles.panelTitle}><div><p className={styles.eyebrow}>YOUR ORGANIZATION</p><h3>Listings & applicants</h3></div><span>{ownedOpportunities.length}</span></div>
              {ownedOpportunities.length === 0 && <p className={styles.emptyState}>Your drafts and listings will show here. Create your first opportunity to get started.</p>}
              {ownedOpportunities.map((listing) => {
                const listingApplications = receivedApplications.filter((application) => application.opportunity_id === listing.id);
                return <article className={styles.managedListing} key={listing.id}>
                  <div className={styles.listingHeading}><div><span className={styles.typePill}>{labels[listing.type] ?? listing.type}</span><strong>{listing.title}</strong><span>{companyName(listing)} · {listing.location}</span></div><div className={styles.listingControls}><span className={`${styles.applicationStatus} ${listing.status === "published" ? styles.status_accepted : styles.status_draft}`}>{listing.status}</span><form action={listingAction}><input type="hidden" name="opportunityId" value={listing.id} /><input type="hidden" name="status" value={listing.status === "published" ? "closed" : "published"} /><button type="submit" className={styles.textButton} disabled={isUpdatingListing}>{listing.status === "published" ? "Close" : "Publish"}</button></form></div></div>
                  <p className={styles.managedDescription}>{listing.description}</p>
                  <div className={styles.applicantsHeading}><strong>Applicants</strong><span>{listingApplications.length}</span></div>
                  {listingApplications.length === 0 && <p className={styles.emptyApplicants}>No applications yet.</p>}
                  {listingApplications.map((application) => <div className={styles.applicantRow} key={application.id}>
                    <div className={styles.applicantIdentity}><strong>{application.applicant?.display_name ?? "TalantaLink talent"}</strong><span>{application.applicant?.headline || application.message || "Application submitted"}</span></div>
                    <div className={styles.applicantDocuments}>{application.documents.map((document) => document.signed_url && <a key={document.document_type} href={document.signed_url} target="_blank" rel="noreferrer">{document.document_type === "cv" ? "CV" : "Portfolio"} ↗</a>)}</div>
                    <form action={statusAction} className={styles.statusForm}><input type="hidden" name="applicationId" value={application.id} /><select name="status" defaultValue={application.status} aria-label={`Status for ${application.applicant?.display_name ?? "applicant"}`} disabled={isUpdating}><option value="submitted" disabled>Submitted</option><option value="reviewing">Reviewing</option><option value="shortlisted">Shortlisted</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select><button type="submit" className={styles.textButton}>Update</button></form>
                  </div>)}
                </article>;
              })}
              <ActionFeedback state={statusState} />
              <ActionFeedback state={listingState} />
            </section>
          </div>
        ) : (
          <>
            <div className={styles.discoveryTools}>
              <div className={styles.categoryScroller}>{categories.map(([value, label]) => <button key={value} type="button" className={category === value ? styles.activeCategory : ""} onClick={() => setCategory(value)}>{label}</button>)}</div>
              <label className={styles.searchBox}><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, skill or location" aria-label="Search opportunities" /></label>
            </div>
            {filteredListings.length === 0 ? <div className={styles.noListings}><span>✳</span><h3>No opportunities found yet</h3><p>Try a different search or category. New opportunities are added by employers and recruiters.</p>{account.role === "talent" && <Link href="/profile/edit">Complete your professional profile →</Link>}</div> :
              <div className={styles.listingGrid}>{filteredListings.map((listing, index) => (
                <article className={styles.listingCard} key={listing.id} style={{ animationDelay: `${Math.min(index, 6) * 55}ms` }}>
                  <div className={styles.cardTop}><span className={styles.typePill}>{labels[listing.type] ?? listing.type}</span><span className={styles.deadline}><span /> Closes {formatDeadline(listing.deadline)}</span></div>
                  <h3>{listing.title}</h3><p className={styles.companyName}>{companyName(listing)}</p>
                  <p className={styles.description}>{listing.description}</p>
                  <div className={styles.requirementBox}><strong>What you’ll need</strong><p>{listing.requirements}</p></div>
                  <div className={styles.listingMeta}><span>⌖ {listing.location}</span>{listing.compensation && <span>◈ {listing.compensation}</span>}</div>
                  {account.role === "talent" ? <details className={styles.applyDetails}>
                    <summary>Apply now <span>→</span></summary>
                    <form className={styles.applicationForm} onSubmit={(event) => void apply(event, listing.id)}>
                      <label>Message <span>Optional</span><textarea name="message" rows={3} maxLength={3000} placeholder="Tell them what makes you a good fit." /></label>
                      <label>CV or résumé <span>Required · PDF, DOC or DOCX · 15 MB max</span><input type="file" name="cv" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label>
                      <label>Portfolio <span>Optional · PDF, DOC, image · 15 MB max</span><input type="file" name="portfolio" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp" /></label>
                      {uploadError && <p className={styles.error} role="alert">{uploadError}</p>}
                      <button type="submit" className={styles.primaryButton} disabled={isUploading}>{isUploading ? "Submitting…" : "Submit application"} <span>→</span></button>
                    </form>
                  </details> : <a className={styles.contactLink} href={`mailto:${listing.contact_email}?subject=${encodeURIComponent(`Application: ${listing.title}`)}`}>Contact the organizer <span>↗</span></a>}
                  {account.role === "talent" && <p className={styles.contactHint}>Questions? <a href={`mailto:${listing.contact_email}`}>Contact the organizer</a></p>}
                </article>
              ))}</div>
            }
          </>
        )}
      </div>
      <footer className={styles.footer}><Link href="/">talanta<span>link</span></Link><p>Where Kenyan talent finds its next opportunity.</p><span>Built for every kind of talent.</span></footer>
    </>
  );
}
