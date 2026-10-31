import Link from "next/link";
import ReportForm from "../report-form";
import styles from "../trust.module.css";

export const metadata = {
  title: "Report a safety concern",
  robots: { index: false, follow: false },
};

export default function TrustReportPage() {
  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/">
        ← TalantaLink
      </Link>
      <section className={styles.card}>
        <p className={styles.eyebrow}>TRUST &amp; SAFETY</p>
        <h1>Report a safety concern</h1>
        <p className={styles.intro}>
          Tell us about a suspicious job, scam, harmful content, or member.
          Reports are reviewed privately.
        </p>
        <ReportForm />
      </section>
    </main>
  );
}
