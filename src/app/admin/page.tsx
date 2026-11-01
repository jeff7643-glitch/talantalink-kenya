import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  reviewAccountReport,
  reviewContentReport,
  reviewTrustSignal,
  saveTalentCategory,
  setAccountSuspension,
  setEmployerVerification,
  setOpportunityStatus,
  setTalentVerification,
} from "./actions";
import styles from "./admin.module.css";
import BrandLink from "@/components/brand-link";

export const metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

type ReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  created_at: string;
};

type AccountReportRow = {
  id: string;
  reported_user_id: string;
  reporter_id: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
};

type TrustSignalRow = {
  id: string;
  target_type: string;
  target_id: string;
  signal_type: string;
  status: string;
  created_at: string;
};

type AdminSearchParams = Record<string, string | string[] | undefined>;

function message(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{note}</small>
    </article>
  );
}

async function AdminContent({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const params = await searchParams;
  const requestedSearch = Array.isArray(params.q) ? params.q[0] : params.q;
  const accountSearch = (requestedSearch ?? "").trim().slice(0, 100);
  const admin = await requireRole(["administrator"]);
  const supabase = await createSupabaseServerClient();
  const [
    { count: userCount, error: usersCountError },
    { count: verifiedTalentCount, error: talentCountError },
    { count: verifiedEmployerCount, error: employerCountError },
    { count: openContentReportCount, error: contentCountError },
    { count: openAccountReportCount, error: accountReportCountError },
    { count: openSignalCount, error: signalCountError },
    { count: liveOpportunityCount, error: opportunityCountError },
    { data: profiles, error: profilesError },
    { data: accountStatuses, error: statusesError },
    { data: companies, error: companiesError },
    { data: verificationDocuments, error: verificationDocumentsError },
    { data: contentReports, error: contentReportsError },
    { data: accountReports, error: accountReportsError },
    { data: trustSignals, error: trustSignalsError },
    { data: opportunities, error: opportunitiesError },
    { data: categories, error: categoriesError },
    { data: talents, error: talentsError },
    { data: auditEvents, error: auditError },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "talent").eq("is_verified", true),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_verified", true),
    supabase.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("message_user_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("trust_safety_signals").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("status", "published"),
    (accountSearch
      ? supabase.from("profiles")
        .select("id,display_name,role,is_verified,created_at")
        .ilike("display_name", `%${accountSearch.replace(/[\\%_]/g, "\\$&")}%`)
        .order("created_at", { ascending: false }).limit(60)
      : supabase.from("profiles")
        .select("id,display_name,role,is_verified,created_at")
        .order("created_at", { ascending: false }).limit(60)),
    supabase.from("admin_account_status")
      .select("user_id,is_suspended,suspension_reason,updated_at"),
    supabase.from("companies")
      .select("id,name,owner_id,is_verified,verification_requested_at,created_at")
      .order("verification_requested_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("company_verification_documents")
      .select("company_id,submitted_by,business_name,registration_type,registration_number,document_path,submitted_at")
      .order("submitted_at", { ascending: false }).limit(40),
    supabase.from("content_reports")
      .select("id,target_type,target_id,reporter_id,reason,status,created_at")
      .eq("status", "open").order("created_at", { ascending: false }).limit(40),
    supabase.from("message_user_reports")
      .select("id,reported_user_id,reporter_id,reason,details,status,created_at")
      .eq("status", "open").order("created_at", { ascending: false }).limit(40),
    supabase.from("trust_safety_signals")
      .select("id,target_type,target_id,signal_type,status,created_at")
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("opportunities")
      .select("id,title,status,company_id,created_at")
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("talent_categories").select("id,name").order("name"),
    supabase.from("talents").select("category_id"),
    supabase.from("admin_audit_log")
      .select("id,actor_id,action,target_type,target_id,created_at")
      .order("created_at", { ascending: false }).limit(12),
  ]);
  message(usersCountError, "Could not count registered accounts");
  message(talentCountError, "Could not count verified talent profiles");
  message(employerCountError, "Could not count verified employers");
  message(contentCountError, "Could not count content reports");
  message(accountReportCountError, "Could not count account reports");
  message(signalCountError, "Could not count suspicious-link signals");
  message(opportunityCountError, "Could not count live listings");
  message(profilesError, "Could not load registered accounts");
  message(statusesError, "Could not load account status");
  message(companiesError, "Could not load employer profiles");
  message(verificationDocumentsError, "Could not load employer verification evidence");
  message(contentReportsError, "Could not load content reports");
  message(accountReportsError, "Could not load account reports");
  message(trustSignalsError, "Could not load suspicious-link signals");
  message(opportunitiesError, "Could not load job listings");
  message(categoriesError, "Could not load talent categories");
  message(talentsError, "Could not load talent category totals");
  message(auditError, "Could not load the moderation audit");

  const accounts = profiles ?? [];
  const profileIds = [...new Set([
    ...accounts.map((profile) => profile.id),
    ...(contentReports ?? []).flatMap((report) => [report.reporter_id, report.target_type === "profile" ? report.target_id : ""]),
    ...(accountReports ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]),
    ...(companies ?? []).map((company) => company.owner_id),
    ...(verificationDocuments ?? []).map((document) => document.submitted_by),
  ].filter(Boolean))];
  const postIds = [...new Set([
    ...(contentReports ?? []).filter((report) => report.target_type === "post").map((report) => report.target_id),
    ...(trustSignals ?? []).filter((signal) => signal.target_type === "post").map((signal) => signal.target_id),
  ])];
  const commentIds = [...new Set([
    ...(contentReports ?? []).filter((report) => report.target_type === "comment").map((report) => report.target_id),
    ...(trustSignals ?? []).filter((signal) => signal.target_type === "comment").map((signal) => signal.target_id),
  ])];
  const opportunityIds = [...new Set([
    ...(contentReports ?? []).filter((report) => report.target_type === "opportunity").map((report) => report.target_id),
    ...(trustSignals ?? []).filter((signal) => signal.target_type === "opportunity").map((signal) => signal.target_id),
  ])];
  const [
    { data: reportProfiles, error: reportProfilesError },
    { data: reportedPosts, error: postsError },
    { data: reportedComments, error: commentsError },
    { data: reportedOpportunities, error: reportedOpportunitiesError },
  ] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length
      ? supabase.from("posts").select("id,content").in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
    commentIds.length
      ? supabase.from("comments").select("id,content").in("id", commentIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length
      ? supabase.from("opportunities").select("id,title").in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  message(reportProfilesError, "Could not load report account names");
  message(postsError, "Could not load reported posts");
  message(commentsError, "Could not load reported comments");
  message(reportedOpportunitiesError, "Could not load reported listings");

  const names = new Map((reportProfiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const postContent = new Map((reportedPosts ?? []).map((post) => [post.id, post.content]));
  const commentContent = new Map((reportedComments ?? []).map((comment) => [comment.id, comment.content]));
  const opportunityTitles = new Map((reportedOpportunities ?? []).map((opportunity) => [opportunity.id, opportunity.title]));
  const statusByUser = new Map((accountStatuses ?? []).map((status) => [status.user_id, status]));
  const talentCounts = new Map<string, number>();
  for (const talent of talents ?? []) {
    talentCounts.set(talent.category_id, (talentCounts.get(talent.category_id) ?? 0) + 1);
  }
  const flaggedAccountCounts = new Map<string, number>();
  for (const report of accountReports ?? []) {
    flaggedAccountCounts.set(report.reported_user_id, (flaggedAccountCounts.get(report.reported_user_id) ?? 0) + 1);
  }
  for (const report of (contentReports ?? []) as ReportRow[]) {
    if (report.target_type === "profile") {
      flaggedAccountCounts.set(report.target_id, (flaggedAccountCounts.get(report.target_id) ?? 0) + 1);
    }
  }
  const flaggedAccounts = [...flaggedAccountCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const openContentReports = (contentReports ?? []) as ReportRow[];
  const openAccountReports = (accountReports ?? []) as AccountReportRow[];
  const openTrustSignals = (trustSignals ?? []) as TrustSignalRow[];
  const signedVerificationDocuments = await Promise.all((verificationDocuments ?? []).map(async (document) => {
    const { data, error } = await supabase.storage
      .from("talantalink-verification-documents")
      .createSignedUrl(document.document_path, 300);
    if (error) throw new Error(`Could not prepare employer verification evidence: ${error.message}`);
    if (!data?.signedUrl) throw new Error("Could not prepare employer verification evidence.");
    return { ...document, signed_url: data?.signedUrl ?? null };
  }));
  const verificationByCompany = new Map(signedVerificationDocuments.map((document) => [document.company_id, document]));

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <BrandLink className={styles.brand} copyClassName={styles.brandCopy}>talanta<span>link</span></BrandLink>
        <div className={styles.topbarRight}>
          <span className={styles.adminBadge}>ADMINISTRATOR</span>
          <span className={styles.adminName}>{admin.display_name}</span>
          <Link className={styles.backLink} href="/dashboard">Account ↗</Link>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <p className={styles.sideEyebrow}>OPERATIONS</p>
          <a href="#overview" className={styles.navActive}>Overview</a>
          <a href="#accounts" className={styles.navLink}>Accounts</a>
          <a href="#verification" className={styles.navLink}>Verification</a>
          <a href="#reports" className={styles.navLink}>Report queue</a>
          <a href="#listings" className={styles.navLink}>Job listings</a>
          <a href="#categories" className={styles.navLink}>Talent categories</a>
          <a href="#audit" className={styles.navLink}>Audit trail</a>
          <div className={styles.sidebarNote}>
            <span className={styles.securityDot} />
            <strong>Protected workspace</strong>
            <small>All administrator changes are access controlled and audited.</small>
          </div>
        </aside>

        <div className={styles.content}>
          <section id="overview" className={styles.intro}>
            <div>
              <p className={styles.eyebrow}>PLATFORM OPERATIONS</p>
              <h1>Administrator dashboard</h1>
              <p>Review platform health and handle account, content, and marketplace operations.</p>
            </div>
            <div className={styles.lastUpdated}>LIVE OVERVIEW <span>•</span> {new Date().toLocaleDateString("en", { dateStyle: "medium" })}</div>
          </section>

          <section className={styles.metrics} aria-label="Platform statistics">
            <Metric label="Registered accounts" value={userCount ?? 0} note="All member profiles" />
            <Metric label="Verified talent" value={verifiedTalentCount ?? 0} note="Talent profiles approved" />
            <Metric label="Verified employers" value={verifiedEmployerCount ?? 0} note="Organizations approved" />
            <Metric label="Reports to review" value={(openContentReportCount ?? 0) + (openAccountReportCount ?? 0) + (openSignalCount ?? 0)} note="Member reports and safety signals" />
            <Metric label="Live listings" value={liveOpportunityCount ?? 0} note="Published opportunities" />
          </section>

          <section id="accounts" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>MEMBERS</p><h2>Registered accounts</h2></div>
              <span className={styles.sectionCount}>{accounts.length} {accountSearch ? "matching accounts" : "most recent"}</span>
            </div>
            <div className={styles.panel}>
              <form method="get" className={styles.accountSearch}>
                <label htmlFor="account-search">Find a member by display name</label>
                <div><input id="account-search" name="q" defaultValue={accountSearch} maxLength={100} placeholder="Search registered accounts" /><button className={styles.buttonSecondary} type="submit">Search</button>{accountSearch && <Link href="/admin" className={styles.clearSearch}>Clear</Link>}</div>
              </form>
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <thead><tr><th>Member</th><th>Account type</th><th>Joined</th><th>Safety</th><th>Account controls</th></tr></thead>
                  <tbody>
                    {accounts.map((profile) => {
                      const status = statusByUser.get(profile.id);
                      const suspended = status?.is_suspended ?? false;
                      return (
                        <tr key={profile.id}>
                          <td><div className={styles.memberCell}><span className={styles.avatar}>{initials(profile.display_name)}</span><span><strong>{profile.display_name}</strong><small>{profile.role} account</small></span></div></td>
                          <td><span className={styles.roleTag}>{profile.role}</span></td>
                          <td>{dateLabel(profile.created_at)}</td>
                          <td><span className={`${styles.status} ${suspended ? styles.statusDanger : styles.statusGood}`}>{suspended ? "Suspended" : "Active"}</span></td>
                          <td>
                            {profile.role === "administrator"
                              ? <span className={styles.muted}>Protected administrator</span>
                              : <form action={setAccountSuspension} className={styles.inlineForm}>
                                <input type="hidden" name="userId" value={profile.id} />
                                <input type="hidden" name="suspended" value={String(!suspended)} />
                                {suspended
                                  ? <button className={styles.buttonSecondary} type="submit">Reactivate</button>
                                  : <><input className={styles.reasonInput} name="reason" maxLength={500} required minLength={8} placeholder="Reason for suspension" aria-label={`Suspension reason for ${profile.display_name}`} /><button className={styles.buttonDanger} type="submit">Suspend</button></>}
                              </form>}
                          </td>
                        </tr>
                      );
                    })}
                    {!accounts.length && <tr><td className={styles.empty} colSpan={5}>No member accounts found.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className={styles.panelFootnote}>Suspension is reversible and does not delete the member or their records. Account email and phone details are intentionally not shown.</p>
            </div>
          </section>

          <section id="verification" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>TRUST & SAFETY</p><h2>Verification review</h2></div>
            </div>
            <div className={styles.twoColumn}>
              <div className={styles.panel}>
                <div className={styles.panelHeading}><h3>Talent profiles</h3><span>{accounts.filter((profile) => profile.role === "talent").length} recent</span></div>
                <div className={styles.reviewList}>
                  {accounts.filter((profile) => profile.role === "talent").slice(0, 16).map((profile) => (
                    <div className={styles.reviewRow} key={profile.id}>
                      <div><strong>{profile.display_name}</strong><small>Talent member</small></div>
                      <form action={setTalentVerification}>
                        <input type="hidden" name="userId" value={profile.id} />
                        <input type="hidden" name="verified" value={String(!profile.is_verified)} />
                        <button className={profile.is_verified ? styles.buttonSecondary : styles.buttonPrimary} type="submit">{profile.is_verified ? "Revoke" : "Verify"}</button>
                      </form>
                    </div>
                  ))}
                  {!accounts.some((profile) => profile.role === "talent") && <p className={styles.empty}>No talent profiles to review.</p>}
                </div>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeading}><h3>Employers</h3><span>Company records</span></div>
                <div className={styles.reviewList}>
                  {(companies ?? []).slice(0, 20).map((company) => (
                    <div className={styles.reviewRow} key={company.id}>
                      <div>
                        <strong>{company.name}</strong>
                        {verificationByCompany.has(company.id)
                          ? <small>
                            Submitted by {names.get(verificationByCompany.get(company.id)!.submitted_by) ?? "Member"} · {verificationByCompany.get(company.id)!.registration_type.replaceAll("_", " ")} · Registration {verificationByCompany.get(company.id)!.registration_number}
                            {verificationByCompany.get(company.id)!.signed_url && <> · <a href={verificationByCompany.get(company.id)!.signed_url!} target="_blank" rel="noreferrer">Review evidence ↗</a></>}
                          </small>
                          : <small>Owner: {names.get(company.owner_id) ?? "Member"}{company.verification_requested_at ? ` · Requested ${dateLabel(company.verification_requested_at)}` : " · No verification documents"}</small>}
                      </div>
                      {company.is_verified
                        ? <form action={setEmployerVerification}>
                          <input type="hidden" name="companyId" value={company.id} /><input type="hidden" name="verified" value="false" />
                          <button className={styles.buttonSecondary} type="submit">Revoke</button>
                        </form>
                        : verificationByCompany.has(company.id)
                          ? <form action={setEmployerVerification}>
                            <input type="hidden" name="companyId" value={company.id} /><input type="hidden" name="verified" value="true" />
                            <button className={styles.buttonPrimary} type="submit">Verify</button>
                          </form>
                          : <span className={styles.muted}>Evidence required</span>}
                    </div>
                  ))}
                  {!companies?.length && <p className={styles.empty}>No employer profiles to review.</p>}
                </div>
              </div>
            </div>
          </section>

          <section id="reports" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>TRUST & SAFETY</p><h2>Report queue</h2></div>
              <span className={styles.sectionCount}>{openContentReports.length + openAccountReports.length} open in current queue</span>
            </div>
            <div className={styles.twoColumn}>
              <div className={styles.panel}>
                <div className={styles.panelHeading}><h3>Reported content</h3><span>{openContentReports.length}</span></div>
                <div className={styles.reportList}>
                  {openContentReports.map((report) => {
                    const targetTitle = report.target_type === "post"
                      ? postContent.get(report.target_id)
                      : report.target_type === "comment"
                        ? commentContent.get(report.target_id)
                        : report.target_type === "opportunity"
                          ? opportunityTitles.get(report.target_id)
                        : names.get(report.target_id);
                    return (
                      <article className={styles.reportCard} key={report.id}>
                        <div className={styles.reportMeta}><span className={styles.roleTag}>{report.target_type}</span><time>{dateLabel(report.created_at)}</time></div>
                        <p className={styles.reportTarget}>{targetTitle || "Reported content unavailable"}</p>
                        <p className={styles.reportReason}>{report.reason}</p>
                        <small className={styles.reporter}>Reported by {names.get(report.reporter_id) ?? "Member"}</small>
                        <div className={styles.reportActions}>
                          <form action={reviewContentReport}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="dismiss" /><button className={styles.buttonSecondary} type="submit">Dismiss</button></form>
                          <form action={reviewContentReport}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="remove" /><button className={styles.buttonDanger} type="submit">Remove content</button></form>
                        </div>
                      </article>
                    );
                  })}
                  {!openContentReports.length && <p className={styles.empty}>No reported content is waiting for review.</p>}
                </div>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeading}><h3>Reported accounts</h3><span>{openAccountReports.length}</span></div>
                <div className={styles.reportList}>
                  {openAccountReports.map((report) => (
                    <article className={styles.reportCard} key={report.id}>
                      <div className={styles.reportMeta}><span className={styles.roleTag}>account</span><time>{dateLabel(report.created_at)}</time></div>
                      <p className={styles.reportTarget}>{names.get(report.reported_user_id) ?? "Member"}</p>
                      <p className={styles.reportReason}>{report.reason}{report.details ? ` · ${report.details}` : ""}</p>
                      <small className={styles.reporter}>Reported by {names.get(report.reporter_id) ?? "Member"}</small>
                      <div className={styles.reportActions}>
                        <form action={reviewAccountReport}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="dismissed" /><button className={styles.buttonSecondary} type="submit">Dismiss</button></form>
                        <form action={reviewAccountReport}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="resolved" /><button className={styles.buttonPrimary} type="submit">Resolve</button></form>
                      </div>
                    </article>
                  ))}
                  {!openAccountReports.length && <p className={styles.empty}>No account reports are waiting for review.</p>}
                </div>
              </div>
            </div>
            <div className={`${styles.panel} ${styles.flaggedPanel}`}>
              <div className={styles.panelHeading}>
                <h3>Suspicious-link signals</h3>
                <span>{openTrustSignals.length} awaiting review</span>
              </div>
              <div className={styles.reportList}>
                {openTrustSignals.map((signal) => {
                  const target = signal.target_type === "post"
                    ? postContent.get(signal.target_id)
                    : signal.target_type === "comment"
                      ? commentContent.get(signal.target_id)
                      : opportunityTitles.get(signal.target_id);
                  return (
                    <article className={styles.reportCard} key={signal.id}>
                      <div className={styles.reportMeta}>
                        <span className={styles.roleTag}>{signal.target_type} · suspicious link</span>
                        <time>{dateLabel(signal.created_at)}</time>
                      </div>
                      <p className={styles.reportTarget}>{target || "Flagged content unavailable"}</p>
                      <div className={styles.reportActions}>
                        <form action={reviewTrustSignal}>
                          <input type="hidden" name="signalId" value={signal.id} />
                          <input type="hidden" name="decision" value="dismissed" />
                          <button className={styles.buttonSecondary} type="submit">Dismiss signal</button>
                        </form>
                        <form action={reviewTrustSignal}>
                          <input type="hidden" name="signalId" value={signal.id} />
                          <input type="hidden" name="decision" value="resolved" />
                          <button className={styles.buttonPrimary} type="submit">Resolve signal</button>
                        </form>
                      </div>
                    </article>
                  );
                })}
                {!openTrustSignals.length && <p className={styles.empty}>No suspicious-link signals are waiting for review.</p>}
              </div>
            </div>
            <div className={`${styles.panel} ${styles.flaggedPanel}`}>
              <div className={styles.panelHeading}><h3>Accounts flagged in multiple open reports</h3><span>Based on the visible report queue</span></div>
              {flaggedAccounts.length
                ? <div className={styles.flaggedList}>{flaggedAccounts.map(([userId, count]) => <div key={userId}><strong>{names.get(userId) ?? "Member"}</strong><span>{count} open reports</span></div>)}</div>
                : <p className={styles.empty}>No account has multiple reports in the current review queue.</p>}
            </div>
          </section>

          <section id="listings" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>MARKETPLACE</p><h2>Job listings</h2></div>
              <span className={styles.sectionCount}>{opportunities?.length ?? 0} recent</span>
            </div>
            <div className={styles.panel}>
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <thead><tr><th>Listing</th><th>Organization</th><th>Created</th><th>Status</th><th>Update status</th></tr></thead>
                  <tbody>
                    {(opportunities ?? []).map((opportunity) => {
                      const company = companies?.find((item) => item.id === opportunity.company_id);
                      return <tr key={opportunity.id}>
                        <td><strong>{opportunity.title}</strong></td>
                        <td>{company?.name ?? "Organization"}</td>
                        <td>{dateLabel(opportunity.created_at)}</td>
                        <td><span className={`${styles.status} ${opportunity.status === "published" ? styles.statusGood : styles.statusNeutral}`}>{opportunity.status}</span></td>
                        <td><form action={setOpportunityStatus} className={styles.inlineForm}>
                          <input type="hidden" name="opportunityId" value={opportunity.id} />
                          <select className={styles.select} name="status" defaultValue={opportunity.status}>
                            <option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option>
                          </select>
                          <button className={styles.buttonSecondary} type="submit">Save</button>
                        </form></td>
                      </tr>;
                    })}
                    {!opportunities?.length && <tr><td className={styles.empty} colSpan={5}>No listings found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section id="categories" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>DISCOVERY</p><h2>Talent categories</h2></div>
              <span className={styles.sectionCount}>{categories?.length ?? 0} categories</span>
            </div>
            <div className={styles.categoryGrid}>
              {(categories ?? []).map((category) => (
                <form action={saveTalentCategory} className={styles.categoryCard} key={category.id}>
                  <input type="hidden" name="categoryId" value={category.id} />
                  <label><span>Category name</span><input name="name" defaultValue={category.name} maxLength={80} minLength={2} required /></label>
                  <div className={styles.categoryFooter}><small>{talentCounts.get(category.id) ?? 0} talent records</small><button className={styles.buttonSecondary} type="submit">Rename</button></div>
                </form>
              ))}
              <form action={saveTalentCategory} className={`${styles.categoryCard} ${styles.newCategory}`}>
                <label><span>Add a category</span><input name="name" placeholder="e.g. Culinary arts" maxLength={80} minLength={2} required /></label>
                <div className={styles.categoryFooter}><small>New discovery category</small><button className={styles.buttonPrimary} type="submit">Add category</button></div>
              </form>
            </div>
            <p className={styles.panelFootnote}>Categories are renamed rather than deleted, preserving existing talent and profile references.</p>
          </section>

          <section id="audit" className={styles.section}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>ACCOUNTABILITY</p><h2>Recent administrator activity</h2></div>
              <span className={styles.sectionCount}>Latest 12 actions</span>
            </div>
            <div className={styles.panel}>
              <div className={styles.auditList}>
                {(auditEvents ?? []).map((event) => (
                  <div className={styles.auditRow} key={event.id}>
                    <span className={styles.auditIcon}>✓</span>
                    <div><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.target_type} · {event.target_id}</small></div>
                    <time>{dateLabel(event.created_at)}</time>
                  </div>
                ))}
                {!auditEvents?.length && <p className={styles.empty}>Administrator operations will appear here as they are performed.</p>}
              </div>
            </div>
          </section>
          <footer className={styles.footer}>TalantaLink operations · Secure administrator workspace</footer>
        </div>
      </div>
    </main>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  return (
    <Suspense fallback={<main className={styles.loading} aria-busy="true"><div><span className={styles.loadingMark}>T</span><p>Loading secure operations…</p></div></main>}>
      <AdminContent searchParams={searchParams} />
    </Suspense>
  );
}
