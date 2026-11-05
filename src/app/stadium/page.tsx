import type { Metadata } from "next";
import Link from "next/link";
import StadiumExperience from "./stadium-experience";
import styles from "./stadium.module.css";

export const metadata: Metadata = {
  title: "Talanta Stadium 3D seat map",
  description:
    "Explore the Talanta Stadium seating layout in an interactive 3D view.",
};

const layoutUrl =
  "https://talantasportscity.com/seatmap/300b29f0-1e58-4983-ab64-6cdea3e13189/layout/1bf67a4cca622034";

export type StadiumSection = {
  id: string;
  code: string;
  name: string | null;
  tier: string;
  category: string;
  seat_count: number;
};

export type StadiumLayout = {
  seat_map: { venue_name: string };
  sections: StadiumSection[];
  scale: number;
  x: number[];
  y: number[];
  s: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStadiumLayout(value: unknown): value is StadiumLayout {
  if (!isRecord(value)) return false;
  const layout = value;
  const { scale, x, y, s, sections, seat_map: seatMap } = layout;
  if (
    typeof scale !== "number" ||
    !Array.isArray(x) ||
    !Array.isArray(y) ||
    !Array.isArray(s) ||
    !Array.isArray(sections) ||
    x.length === 0 ||
    x.length !== y.length ||
    x.length !== s.length
  ) {
    return false;
  }

  if (
    !isRecord(seatMap) ||
    typeof seatMap.venue_name !== "string"
  ) {
    return false;
  }

  return (
    x.every((coordinate) => typeof coordinate === "number") &&
    y.every((coordinate) => typeof coordinate === "number") &&
    s.every(
      (sectionIndex) =>
        typeof sectionIndex === "number" &&
        Number.isInteger(sectionIndex) &&
        sectionIndex >= 0 &&
        sectionIndex < sections.length,
    ) &&
    sections.every(
      (section) =>
        isRecord(section) &&
        typeof section.id === "string" &&
        typeof section.code === "string" &&
        (typeof section.name === "string" || section.name === null) &&
        typeof section.tier === "string" &&
        typeof section.category === "string" &&
        typeof section.seat_count === "number",
    )
  );
}

async function fetchStadiumLayout(): Promise<StadiumLayout> {
  const response = await fetch(layoutUrl, {
    cache: "force-cache",
    next: { revalidate: 300 },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`The stadium service returned HTTP ${response.status}.`);
  }

  const layout: unknown = await response.json();
  if (!isStadiumLayout(layout)) {
    throw new Error("The stadium service returned an unsupported layout.");
  }

  return layout;
}

export default async function StadiumPage() {
  let result: { layout: StadiumLayout } | { error: string };
  try {
    result = { layout: await fetchStadiumLayout() };
  } catch (error) {
    result = {
      error:
        error instanceof Error
          ? error.message
          : "The service could not be reached.",
    };
  }

  if ("error" in result) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/">
            Talanta<span>Link</span>
          </Link>
          <Link className={styles.backLink} href="/">
            Back to community
          </Link>
        </header>
        <section className={styles.errorCard} role="alert">
          <span className={styles.eyebrow}>TALANTA STADIUM</span>
          <h1>We couldn’t load the stadium layout</h1>
          <p>{result.error}</p>
          <Link className={styles.retryButton} href="/stadium">
            Try again
          </Link>
        </section>
      </main>
    );
  }

  return <StadiumExperience layout={result.layout} />;
}
