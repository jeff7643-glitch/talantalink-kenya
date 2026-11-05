"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import StadiumViewer from "./stadium-viewer";
import type { StadiumLayout, StadiumSection } from "./page";
import {
  getStadiumCategoryLabel,
  getStadiumTierColor,
} from "./stadium-palette";
import styles from "./stadium.module.css";

const stadiumPhotos = [
  {
    src: "/talanta-stadium-bowl.png",
    alt: "Wide view across the stadium bowl, with red upper stands, a teal lower tier and the green pitch.",
    label: "Inside the bowl",
  },
  {
    src: "/talanta-stadium-interior.png",
    alt: "View of the stadium seating and pitch from the stands.",
    label: "Stadium interior",
  },
  {
    src: "/talanta-stadium-seating.png",
    alt: "Close view of the stadium's red and teal seating tiers.",
    label: "Seating details",
  },
  {
    src: "/talanta-stadium-exterior.png",
    alt: "Exterior view of the stadium beneath a bright blue sky.",
    label: "Stadium exterior",
  },
];

const tierLabel: Record<string, string> = {
  lower: "Lower tier",
  middle: "Middle tier",
  upper: "Upper tier",
};

function formatCategory(category: string) {
  return getStadiumCategoryLabel(category);
}

function getSectionName(section: StadiumSection) {
  return section.name ?? section.code;
}

export default function StadiumExperience({
  layout,
}: {
  layout: StadiumLayout;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const selectedSection = layout.sections.find(
    (section) => section.id === selectedSectionId,
  );
  const sectionOptions = useMemo(
    () =>
      layout.sections.filter(
        (section) => tierFilter === "all" || section.tier === tierFilter,
      ),
    [layout.sections, tierFilter],
  );
  const seatCount = layout.sections.reduce(
    (total, section) => total + section.seat_count,
    0,
  );

  function chooseSection(section: StadiumSection | undefined) {
    setSelectedSectionId(section?.id ?? null);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Talanta<span>Link</span>
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.liveLabel}>
            <span />
            Live stadium layout
          </span>
          <Link className={styles.backLink} href="/">
            Back to community
          </Link>
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>TALANTA STADIUM · NAIROBI</span>
          <h1>Raila Odinga International Stadium</h1>
          <p>
            See the real stadium, then explore its seating bowl in 3D. Drag to
            rotate, scroll to zoom, or select a section to inspect it.
          </p>
        </div>
        <div className={styles.stats} aria-label="Stadium layout summary">
          <span>
            <strong>{layout.sections.length}</strong>
            sections
          </span>
          <span>
            <strong>{seatCount.toLocaleString()}</strong>
            listed capacity
          </span>
        </div>
      </section>

      <section className={styles.photoGallery} aria-label="Stadium photo gallery">
        <div className={styles.featurePhoto}>
          <Image
            key={stadiumPhotos[activePhotoIndex].src}
            className={styles.featurePhotoImage}
            src={stadiumPhotos[activePhotoIndex].src}
            alt={stadiumPhotos[activePhotoIndex].alt}
            fill
            priority
            sizes="(max-width: 700px) 100vw, 1320px"
          />
          <div className={styles.photoShade} />
          <div className={styles.photoCaption} aria-live="polite">
            <span>RAILA ODINGA INTERNATIONAL STADIUM</span>
            <strong>{stadiumPhotos[activePhotoIndex].label}</strong>
          </div>
          <span className={styles.photoCount}>
            {activePhotoIndex + 1} / {stadiumPhotos.length}
          </span>
        </div>
        <div className={styles.photoPicker} aria-label="Choose a stadium photo">
          {stadiumPhotos.map((photo, index) => (
            <button
              key={photo.src}
              className={`${styles.photoOption} ${index === activePhotoIndex ? styles.photoOptionActive : ""}`}
              type="button"
              aria-label={`Show ${photo.label.toLowerCase()}`}
              aria-pressed={index === activePhotoIndex}
              onClick={() => setActivePhotoIndex(index)}
            >
              <span className={styles.photoThumbnail}>
                <Image src={photo.src} alt="" fill sizes="160px" />
              </span>
              <span>{photo.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.explorer} aria-label="Interactive stadium map">
        <div className={styles.viewerColumn}>
          <div className={styles.viewerHeading}>
            <div>
              <span className={styles.eyebrow}>INTERACTIVE SEAT MAP</span>
              <h2>{layout.seat_map.venue_name}</h2>
            </div>
            <span className={styles.dragHint}>Drag to rotate · Scroll to zoom</span>
          </div>
          <StadiumViewer
            layout={layout}
            selectedSectionId={selectedSectionId}
            onSelectSection={setSelectedSectionId}
          />
          <div className={styles.legend} aria-label="Seat colors by tier">
            {["lower", "middle", "upper"].map((tier) => (
              <span key={tier}>
                <i style={{ backgroundColor: getStadiumTierColor(tier) }} />
                {tierLabel[tier]}
              </span>
            ))}
          </div>
        </div>

        <aside className={styles.panel}>
          <div className={styles.panelHeading}>
            <span className={styles.eyebrow}>EXPLORE SECTIONS</span>
            <h2>Choose your section</h2>
          </div>
          <label className={styles.fieldLabel} htmlFor="stadium-tier">
            Seating tier
          </label>
          <select
            className={styles.select}
            id="stadium-tier"
            value={tierFilter}
            onChange={(event) => {
              setTierFilter(event.target.value);
              chooseSection(undefined);
            }}
          >
            <option value="all">All tiers</option>
            <option value="lower">Lower tier</option>
            <option value="middle">Middle tier</option>
            <option value="upper">Upper tier</option>
          </select>

          <label className={styles.fieldLabel} htmlFor="stadium-section">
            Section
          </label>
          <select
            className={styles.select}
            id="stadium-section"
            value={selectedSectionId ?? ""}
            onChange={(event) =>
              chooseSection(
                sectionOptions.find((section) => section.id === event.target.value),
              )
            }
          >
            <option value="">Select a section</option>
            {sectionOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {getSectionName(section)} · {formatCategory(section.category)}
              </option>
            ))}
          </select>

          {selectedSection ? (
            <div className={styles.sectionDetails} aria-live="polite">
              <span className={styles.detailLabel}>Selected section</span>
              <h3>{getSectionName(selectedSection)}</h3>
              <p>
                {tierLabel[selectedSection.tier] ?? selectedSection.tier} ·{" "}
                {formatCategory(selectedSection.category)}
              </p>
              <div className={styles.capacity}>
                <strong>{selectedSection.seat_count.toLocaleString()}</strong>
                <span>seats in this section</span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyDetails} aria-live="polite">
              <span className={styles.selectionIcon}>↗</span>
              <p>Select any section in the map or use the list above to see its details.</p>
            </div>
          )}

          <p className={styles.dataNote}>
            Seat counts and section positions are supplied by Talanta Stadium’s
            published layout.
          </p>
        </aside>
      </section>
    </main>
  );
}
