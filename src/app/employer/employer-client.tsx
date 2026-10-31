"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  requestApplicantConnection,
  saveCompanyLogo,
  saveCompanyProfile,
  saveCompanyVerification,
  type EmployerActionState,
} from "./actions";
import { updateApplicationStatus, type MarketplaceActionState } from "../opportunities/actions";
import styles from "./employer.module.css";

export type EmployerCompany = {
  id: string;
  name: string;
  description: string;
  website: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  is_verified: boolean;
  verification_requested_at: string | null;
  verification_submitted_at: string | null;
};

export type EmployerOpportunity = {
  id: string;
  company_id: string;
  title: string;
  type: string;
  location: string;
  deadline: string;
  status: string;
  created_at: string;
};

export type EmployerActivity = {
  id: string;
  company_id: string;
  opportunity_id: string | null;
  application_id: string | null;
  activity_type: string;
  created_at: string;
};

export type EmployerApplication = {
  id: string;
  opportunity_id: string;
  applicant_id: string;
  status: string;
  message: string;
  created_at: string;
  opportunity: EmployerOpportunity | null;
  company: EmployerCompany | null;
  applicant: { id: string; display_name: string; headline: string | null; avatar_url: string | null } | null;
  documents: { id: string; document_type: string; file_name: string; signed_url: string | null }[];
  connectionStatus: string | null;
};

type Props = {
  userId: string;
  companies: EmployerCompany[];
  opportunities: EmployerOpportunity[];
  applications: EmployerApplication[];
  activities: EmployerActivity[];
};

const activityLabels: Record<string, string> = {
  company_profile_created: "Organization profile created",
  company_profile_updated: "Organization profile updated",
  verification_requested: "Verification requested",
  opportunity_created: "Opportunity created",
  opportunity_published: "Opportunity published",
  opportunity_closed: "Opportunity closed",
  application_received: "New application received",
  application_reviewing: "Application under review",
  application_shortlisted: "Applicant shortlisted",
  application_approved: "Applicant approved",
  application_rejected: "Application declined",
};

const opportunityLabels: Record<string, string> = {
  job: "Job",
  audition: "Audition",
  internship: "Internship",
  competition: "Competition",
  freelance_gig: "Freelance gig",
  sponsorship: "Sponsorship",
  collaboration: "Collaboration",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(value));
}

function ActionMessage({ state }: { state: EmployerActionState | MarketplaceActionState }) {
  if (!state.error && !state.notice) return null;
  return <p className={state.error ? styles.error : styles.notice} role={state.error ? "alert" : "status"}>{state.error ?? state.notice}</p>;
}

function CompanyEditor({ company, userId }: { company?: EmployerCompany; userId: string }) {
  const router = useRouter();
  const [profileState, profileAction, savingProfile] = useActionState(saveCompanyProfile, {});
  const [logoNotice, setLogoNotice] = useState("");
  const [uploadingLogo, startLogoUpload] = useTransition();
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [uploadingVerification, startVerificationUpload] = useTransition();
  const companyId = company?.id ?? profileState.companyId ?? "";

  function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !companyId) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setLogoNotice("Choose a JPEG, PNG, WebP or AVIF logo under 5 MB.");
      return;
    }

    startLogoUpload(async () => {
      setLogoNotice("");
      const extension: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif",
      };
      const path = `${userId}/${companyId}/${crypto.randomUUID()}.${extension[file.type]}`;
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("talantalink-company-logos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setLogoNotice("Could not upload this logo. Check the file and try again.");
        return;
      }

      const formData = new FormData();
      formData.set("companyId", companyId);
      formData.set("storagePath", path);
      const result = await saveCompanyLogo(formData);
      setLogoNotice(result.error ?? result.notice ?? "");
    });
  }

  function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("verificationFile");
    if (!(file instanceof File) || !file.size) {
      setVerificationFailed(true);
      setVerificationNotice("Choose a PDF document to submit.");
      return;
    }
    if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) {
      setVerificationFailed(true);
      setVerificationNotice("Choose a PDF verification document under 5 MB.");
      return;
    }
    if (!companyId) {
      setVerificationFailed(true);
      setVerificationNotice("Save your organization profile before submitting verification.");
      return;
    }

    startVerificationUpload(async () => {
      setVerificationFailed(false);
      setVerificationNotice("");
      const path = `${userId}/${companyId}/${crypto.randomUUID()}.pdf`;
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("talantalink-verification-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) {
        setVerificationFailed(true);
        setVerificationNotice("Could not upload this document. Check the file and try again.");
        return;
      }

      const submission = new FormData();
      submission.set("companyId", companyId);
      submission.set("businessName", String(values.get("businessName") ?? ""));
      submission.set("registrationType", String(values.get("registrationType") ?? ""));
      submission.set("registrationNumber", String(values.get("registrationNumber") ?? ""));
      submission.set("documentPath", path);
      const result = await saveCompanyVerification(submission);
      if (result.error) {
        const { data: savedDocument, error: lookupError } = await supabase
          .from("company_verification_documents")
          .select("company_id")
          .eq("document_path", path)
          .maybeSingle();
        if (lookupError) {
          setVerificationFailed(true);
          setVerificationNotice(`${result.error} The uploaded file could not be checked for cleanup.`);
          return;
        }
        if (!savedDocument) {
          const { error: cleanupError } = await supabase.storage
            .from("talantalink-verification-documents")
            .remove([path]);
          if (cleanupError) {
            setVerificationFailed(true);
            setVerificationNotice(`${result.error} The unused upload could not be removed.`);
            return;
          }
        }
      }
      setVerificationFailed(Boolean(result.error));
      setVerificationNotice(result.error ?? result.notice ?? "");
      if (result.notice) router.refresh();
    });
  }

  return (
    <article className={styles.companyCard}>
      <div className={styles.companyHeading}>
        <div className={styles.logoFrame}>
          {company?.logo_url
            ? <Image src={company.logo_url} alt={`${company.name} logo`} width={56} height={56} unoptimized />
            : <span aria-hidden="true">{(company?.name ?? "New").slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <p className={styles.eyebrow}>ORGANIZATION PROFILE</p>
          <h3>{company?.name ?? "Create your organization"}</h3>
        </div>
        {company?.is_verified && <span className={styles.verifiedBadge}>Verified</span>}
      </div>
      <form action={profileAction} className={styles.companyForm}>
        <input type="hidden" name="companyId" value={companyId} />
        <label>Organization name<input name="name" required maxLength={160} defaultValue={company?.name ?? ""} placeholder="Company or organization name" /></label>
        <label>About the organization<textarea name="description" rows={3} maxLength={3000} defaultValue={company?.description ?? ""} placeholder="What your organization does and the talent you work with." /></label>
        <label>Website<input name="website" type="url" inputMode="url" defaultValue={company?.website ?? ""} placeholder="https://example.co.ke" /></label>
        <div className={styles.companyFormActions}>
          <button type="submit" className={styles.secondaryButton} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
          {companyId && <label className={styles.uploadButton}>Upload logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadLogo} disabled={uploadingLogo} /></label>}
        </div>
        <ActionMessage state={profileState} />
        {logoNotice && <p className={logoNotice.startsWith("Could not") || logoNotice.startsWith("Choose") ? styles.error : styles.notice} role="status">{uploadingLogo ? "Uploading logo..." : logoNotice}</p>}
      </form>
      {companyId && !company?.is_verified && (
        <form className={styles.verificationForm} onSubmit={submitVerification}>
          <p className={styles.eyebrow}>EMPLOYER VERIFICATION</p>
          {company?.verification_submitted_at
            ? <p className={styles.pendingBadge}>Evidence submitted {dateLabel(company.verification_submitted_at)} - under review</p>
            : <p className={styles.muted}>Submit organization registration evidence to request a verified employer badge.</p>}
          <input type="hidden" name="companyId" value={companyId} />
          <label>Registered organization name<input name="businessName" required maxLength={160} defaultValue={company?.name ?? ""} /></label>
          <div className={styles.verificationFields}>
            <label>Organization type<select name="registrationType" defaultValue="business"><option value="business">Business</option><option value="nonprofit">Nonprofit</option><option value="public_body">Public body</option><option value="other">Other</option></select></label>
            <label>Registration number<input name="registrationNumber" required maxLength={120} /></label>
          </div>
          <label>Registration evidence (PDF, max 5 MB)<input name="verificationFile" type="file" accept="application/pdf,.pdf" required /></label>
          <button type="submit" className={styles.secondaryButton} disabled={uploadingVerification}>{uploadingVerification ? "Submitting..." : company?.verification_submitted_at ? "Replace evidence" : "Submit for verification"}</button>
          {verificationNotice && <p className={verificationFailed ? styles.error : styles.notice} role={verificationFailed ? "alert" : "status"}>{verificationNotice}</p>}
        </form>
      )}
    </article>
  );
}

function ApplicationCard({ application }: { application: EmployerApplication }) {
  const [statusState, statusAction, updatingStatus] = useActionState(
    (_state: MarketplaceActionState, formData: FormData) => updateApplicationStatus(formData),
    {},
  );
  const [contactState, contactAction, requestingContact] = useActionState(
    (_state: EmployerActionState, formData: FormData) => requestApplicantConnection(formData),
    {},
  );
  const applicantName = application.applicant?.display_name || "TalantaLink talent";
  const connected = application.connectionStatus === "accepted";

  return (
    <article className={styles.applicantCard}>
      <div className={styles.applicantTop}>
        <div>
          <p className={styles.eyebrow}>{application.opportunity?.title ?? "Opportunity"}</p>
          <h4>{applicantName}</h4>
          <p className={styles.applicantHeadline}>{application.applicant?.headline || "Applicant"} - Applied {dateLabel(application.created_at)}</p>
        </div>
        <span className={`${styles.statusBadge} ${styles[`status_${application.status}`] ?? ""}`}>{application.status}</span>
      </div>
      {application.message && <p className={styles.applicationMessage}>{application.message}</p>}
      <div className={styles.documentLinks}>
        {application.documents.map((document) => document.signed_url
          ? <a key={document.id} href={document.signed_url} target="_blank" rel="noreferrer">{document.document_type === "cv" ? "View CV" : "View portfolio"} - {document.file_name}</a>
          : <span key={document.id} className={styles.muted}>File unavailable</span>)}
      </div>
      <div className={styles.applicantActions}>
        {application.applicant && <Link className={styles.textButton} href={`/talent/${application.applicant.id}`}>View profile</Link>}
        {connected
          ? <Link className={styles.textButton} href="/inbox">Message applicant</Link>
          : <form action={contactAction}>
              <input type="hidden" name="applicationId" value={application.id} />
              <button type="submit" className={styles.textButton} disabled={requestingContact || application.connectionStatus === "pending"}>
                {application.connectionStatus === "pending" ? "Connection requested" : requestingContact ? "Requesting..." : "Request contact"}
              </button>
            </form>}
        <form action={statusAction} className={styles.statusForm}>
          <input type="hidden" name="applicationId" value={application.id} />
          <select name="status" defaultValue="" required aria-label={`Update ${applicantName}'s application status`}>
            <option value="" disabled>Change status...</option>
            <option value="reviewing">Reviewing</option>
            <option value="shortlisted">Shortlist</option>
            <option value="accepted">Approve</option>
            <option value="rejected">Reject</option>
          </select>
          <button type="submit" className={styles.secondaryButton} disabled={updatingStatus}>{updatingStatus ? "Saving..." : "Update"}</button>
        </form>
      </div>
      <ActionMessage state={contactState} />
      <ActionMessage state={statusState} />
    </article>
  );
}

export default function EmployerDashboard({
  userId,
  companies,
  opportunities,
  applications,
  activities,
}: Props) {
  const [filterCompany, setFilterCompany] = useState("all");
  const visibleApplications = applications.filter((application) =>
    filterCompany === "all" || application.company?.id === filterCompany,
  );
  const activeListings = opportunities.filter((opportunity) => opportunity.status === "published").length;
  const pendingApplications = applications.filter((application) => ["submitted", "reviewing"].includes(application.status)).length;
  const shortlisted = applications.filter((application) => application.status === "shortlisted").length;
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const opportunityNames = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity.title]));

  return (
    <div className={styles.content}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>TALANTALINK FOR EMPLOYERS</p>
        <h1>Build your team.<br /><span>Find top talent across Kenya.</span></h1>
        <p>Manage your organization, publish opportunities and keep every applicant moving through your recruitment process.</p>
        <Link href="/opportunities" className={styles.heroButton}>Publish an opportunity <span>-&gt;</span></Link>
      </section>

      <section className={styles.metrics} aria-label="Recruitment overview">
        <article><span>Published opportunities</span><strong>{activeListings}</strong></article>
        <article><span>Total applicants</span><strong>{applications.length}</strong></article>
        <article><span>Need review</span><strong>{pendingApplications}</strong></article>
        <article><span>Shortlisted</span><strong>{shortlisted}</strong></article>
      </section>

      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>YOUR ORGANIZATION</p><h2>Company profiles</h2></div>
        {companies.length > 0 && <span>{companies.length} organization{companies.length === 1 ? "" : "s"}</span>}
      </div>
      <section className={styles.companyGrid}>
        {companies.map((company) => <CompanyEditor key={company.id} company={company} userId={userId} />)}
        <CompanyEditor userId={userId} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>RECRUITMENT WORKSPACE</p><h2>Applicants</h2></div>
          <label className={styles.companyFilter}>Organization
            <select value={filterCompany} onChange={(event) => setFilterCompany(event.target.value)}>
              <option value="all">All organizations</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        </div>
        {opportunities.length === 0 && <p className={styles.emptyState}>Create an organization profile, then publish an opportunity to start receiving applications.</p>}
        {opportunities.length > 0 && (
          <div className={styles.listingTable}>
            {opportunities.map((opportunity) => {
              const listingApplications = visibleApplications.filter((application) => application.opportunity_id === opportunity.id);
              return (
                <article className={styles.listingRow} key={opportunity.id}>
                  <div className={styles.listingTitle}>
                    <span className={`${styles.statusBadge} ${opportunity.status === "published" ? styles.status_accepted : styles.status_draft}`}>{opportunity.status}</span>
                    <strong>{opportunity.title}</strong>
                    <span>{companyNames.get(opportunity.company_id) ?? "Organization"} - {opportunityLabels[opportunity.type] ?? opportunity.type} - {opportunity.location}</span>
                    <small>Deadline {dateLabel(opportunity.deadline)}</small>
                  </div>
                  <div className={styles.applicantsColumn}>
                    <strong>{listingApplications.length} applicant{listingApplications.length === 1 ? "" : "s"}</strong>
                    {listingApplications.length === 0
                      ? <p className={styles.muted}>No applications yet.</p>
                      : listingApplications.map((application) => <ApplicationCard application={application} key={application.id} />)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>AUDITABLE PROGRESS</p><h2>Recruitment activity</h2></div><span>Latest {activities.length}</span></div>
        {activities.length === 0
          ? <p className={styles.emptyState}>Organization, listing and application updates will appear here automatically.</p>
          : <ol className={styles.activityList}>
              {activities.map((activity) => (
                <li key={activity.id}>
                  <span className={styles.activityDot} />
                  <div><strong>{activityLabels[activity.activity_type] ?? "Recruitment activity"}</strong><span>{companyNames.get(activity.company_id)}{activity.opportunity_id ? ` - ${opportunityNames.get(activity.opportunity_id) ?? "Opportunity"}` : ""}</span></div>
                  <time dateTime={activity.created_at}>{dateLabel(activity.created_at)}</time>
                </li>
              ))}
            </ol>}
      </section>
    </div>
  );
}
