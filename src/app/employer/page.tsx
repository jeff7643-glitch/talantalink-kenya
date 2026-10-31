import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/signed-urls";
import EmployerDashboard, {
  type EmployerActivity,
  type EmployerApplication,
  type EmployerCompany,
  type EmployerOpportunity,
} from "./employer-client";
import styles from "./employer.module.css";

export const metadata = {
  title: "Employer dashboard",
  robots: { index: false, follow: false },
};

async function EmployerDashboardContent() {
  const account = await requireRole(["employer", "recruiter", "administrator"]);
  const supabase = await createSupabaseServerClient();
  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .select("id,name,description,website,logo_url,logo_storage_path,is_verified,verification_requested_at")
    .eq("owner_id", account.id)
    .order("created_at", { ascending: true });
  if (companyError) throw new Error(`Could not load your organizations: ${companyError.message}`);

  const companyIds = (companyRows ?? []).map((company) => company.id);
  const { data: verificationRows, error: verificationError } = companyIds.length
    ? await supabase
        .from("company_verification_documents")
        .select("company_id,submitted_at")
        .in("company_id", companyIds)
    : { data: [], error: null };
  if (verificationError) throw new Error(`Could not load verification status: ${verificationError.message}`);
  const verificationByCompany = new Map((verificationRows ?? []).map((row) => [row.company_id, row.submitted_at]));
  const companies = (companyRows ?? []).map((company) => ({
    ...company,
    verification_submitted_at: verificationByCompany.get(company.id) ?? null,
  })) as EmployerCompany[];
  const { data: opportunityRows, error: opportunityError } = companyIds.length
    ? await supabase
        .from("opportunities")
        .select("id,company_id,title,type,location,deadline,status,created_at")
        .in("company_id", companyIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (opportunityError) throw new Error(`Could not load your opportunities: ${opportunityError.message}`);

  const opportunities = (opportunityRows ?? []) as EmployerOpportunity[];
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  const { data: applicationRows, error: applicationError } = opportunityIds.length
    ? await supabase
        .from("applications")
        .select("id,opportunity_id,applicant_id,status,message,created_at")
        .in("opportunity_id", opportunityIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (applicationError) throw new Error(`Could not load applicants: ${applicationError.message}`);

  const applications = applicationRows ?? [];
  const applicantIds = [...new Set(applications.map((application) => application.applicant_id))];
  const applicationIds = applications.map((application) => application.id);
  const [profilesResult, documentsResult, activityResult, connectionsResult] = await Promise.all([
    applicantIds.length
      ? supabase.from("profiles").select("id,display_name,headline,avatar_path,avatar_bucket").in("id", applicantIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase.from("opportunity_application_documents")
          .select("id,application_id,document_type,file_name,storage_path,mime_type")
          .in("application_id", applicationIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabase.from("employer_recruitment_activities")
          .select("id,company_id,opportunity_id,application_id,activity_type,created_at")
          .in("company_id", companyIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    applicantIds.length
      ? supabase.from("connections")
          .select("requester_id,receiver_id,status")
          .or(`requester_id.eq.${account.id},receiver_id.eq.${account.id}`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw new Error(`Could not load applicant profiles: ${profilesResult.error.message}`);
  if (documentsResult.error) throw new Error(`Could not load applicant documents: ${documentsResult.error.message}`);
  if (activityResult.error) throw new Error(`Could not load recruitment activity: ${activityResult.error.message}`);
  if (connectionsResult.error) throw new Error(`Could not load applicant contact status: ${connectionsResult.error.message}`);

  const applicantAvatarUrls = await signAvatarUrls(supabase, profilesResult.data ?? []);
  const signedDocuments = await Promise.all((documentsResult.data ?? []).map(async (document) => {
    const { data, error } = await supabase.storage
      .from("talantalink-application-files")
      .createSignedUrl(document.storage_path, 3600);
    if (error) throw new Error(`Could not prepare applicant document ${document.file_name}: ${error.message}`);
    return { ...document, signed_url: data.signedUrl };
  }));
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [
    profile.id,
    { ...profile, avatar_url: applicantAvatarUrls.get(profile.id) ?? null },
  ]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const connectionByApplicant = new Map(
    (connectionsResult.data ?? []).map((connection) => [
      connection.requester_id === account.id ? connection.receiver_id : connection.requester_id,
      connection.status,
    ]),
  );
  const employerApplications: EmployerApplication[] = applications.map((application) => ({
    ...application,
    opportunity: opportunityById.get(application.opportunity_id) ?? null,
    company: opportunityById.get(application.opportunity_id)
      ? companyById.get(opportunityById.get(application.opportunity_id)!.company_id) ?? null
      : null,
    applicant: profileById.get(application.applicant_id) ?? null,
    documents: signedDocuments
      .filter((document) => document.application_id === application.id)
      .map((document) => ({ ...document, signed_url: document.signed_url })),
    connectionStatus: connectionByApplicant.get(application.applicant_id) ?? null,
  }));

  return (
    <EmployerDashboard
      userId={account.id}
      companies={companies}
      opportunities={opportunities}
      applications={employerApplications}
      activities={(activityResult.data ?? []) as EmployerActivity[]}
    />
  );
}

export default function EmployerDashboardPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>talanta<span>link</span><small>HOME OF TALENTS</small></Link>
        <nav><Link href="/opportunities">Marketplace</Link><Link href="/dashboard">Your account</Link></nav>
      </header>
      <Suspense fallback={<div className={styles.loading} aria-busy="true">Loading your hiring dashboard...</div>}>
        <EmployerDashboardContent />
      </Suspense>
    </main>
  );
}
