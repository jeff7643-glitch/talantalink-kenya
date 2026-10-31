import { Suspense } from "react";
import Link from "next/link";
import { requireCompletedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OpportunitiesMarketplace from "./marketplace-client";
import styles from "./opportunities.module.css";

export const metadata = {
  title: "Opportunities in Kenya",
  description: "Find jobs, auditions, internships, competitions, freelance gigs and sponsorship opportunities across Kenya.",
  robots: { index: false, follow: false },
};

async function MarketplaceContent() {
  const account = await requireCompletedProfile();
  const supabase = await createSupabaseServerClient();
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id,title,description,requirements,type,location,compensation,deadline,contact_email,created_at,status,company_id,companies(name)")
    .eq("status", "published")
    .gt("deadline", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load opportunities: ${error.message}`);

  const { data: applications, error: applicationsError } = account.role === "talent"
    ? await supabase.from("applications")
      .select("id,opportunity_id,status,message,created_at,opportunities(title)")
      .eq("applicant_id", account.id)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (applicationsError) throw new Error(`Could not load your applications: ${applicationsError.message}`);

  let ownedOpportunities: NonNullable<typeof opportunities> = [];
  if (["employer", "recruiter", "administrator"].includes(account.role)) {
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", account.id);
    if (companyError) throw new Error(`Could not load your organizations: ${companyError.message}`);
    const companyIds = (companies ?? []).map((company) => company.id);
    if (companyIds.length) {
      const { data, error: ownedError } = await supabase
        .from("opportunities")
        .select("id,title,description,requirements,type,location,compensation,deadline,contact_email,created_at,status,company_id,companies(name)")
        .in("company_id", companyIds)
        .order("created_at", { ascending: false });
      if (ownedError) throw new Error(`Could not load your listings: ${ownedError.message}`);
      ownedOpportunities = data ?? [];
    }
  }

  const listingIds = ownedOpportunities.map((listing) => String(listing.id));
  const { data: receivedApplications, error: receivedError } = listingIds.length
    ? await supabase.from("applications")
      .select("id,opportunity_id,applicant_id,status,message,created_at")
      .in("opportunity_id", listingIds)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (receivedError) throw new Error(`Could not load applicants: ${receivedError.message}`);

  const applicantIds = [...new Set((receivedApplications ?? []).map((application) => application.applicant_id))];
  const { data: applicants, error: applicantsError } = applicantIds.length
    ? await supabase.from("profiles").select("id,display_name,headline").in("id", applicantIds)
    : { data: [], error: null };
  if (applicantsError) throw new Error(`Could not load applicant profiles: ${applicantsError.message}`);

  const applicationIds = (receivedApplications ?? []).map((application) => application.id);
  const { data: documents, error: documentsError } = applicationIds.length
    ? await supabase.from("opportunity_application_documents")
      .select("id,application_id,document_type,file_name,storage_path")
      .in("application_id", applicationIds)
    : { data: [], error: null };
  if (documentsError) throw new Error(`Could not load application documents: ${documentsError.message}`);

  const links = await Promise.all((documents ?? []).map(async (document) => {
    const { data } = await supabase.storage
      .from("talantalink-application-files")
      .createSignedUrl(document.storage_path, 3600);
    return { ...document, signed_url: data?.signedUrl ?? null };
  }));
  const applicantMap = Object.fromEntries((applicants ?? []).map((applicant) => [applicant.id, applicant]));

  return (
    <OpportunitiesMarketplace
      account={account}
      listings={opportunities ?? []}
      applications={applications ?? []}
      ownedOpportunities={ownedOpportunities}
      receivedApplications={(receivedApplications ?? []).map((application) => ({
        ...application,
        applicant: applicantMap[application.applicant_id] ?? null,
        documents: links.filter((document) => document.application_id === application.id),
      }))}
    />
  );
}

export default function OpportunitiesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>talanta<span>link</span><small>HOME OF TALENTS</small></Link>
        <Link href="/dashboard" className={styles.accountLink}>Your account <span>↗</span></Link>
      </header>
      <Suspense fallback={<div className={styles.loading} aria-busy="true"><span />Finding your next opportunity…</div>}>
        <MarketplaceContent />
      </Suspense>
    </main>
  );
}
