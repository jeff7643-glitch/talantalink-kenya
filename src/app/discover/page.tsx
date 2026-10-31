import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/signed-urls";
import styles from "./discover.module.css";

const PAGE_SIZE = 12;
const MAX_EXPERIENCE = 80;
const DISCOVERY_CATEGORIES = [
  "Music",
  "Sports",
  "Acting",
  "Dancing",
  "Photography",
  "Technology",
  "Art",
  "Fashion",
  "Writing",
  "Entrepreneurship",
  "Other skills",
] as const;
const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available for work" },
  { value: "open_to_opportunities", label: "Open to opportunities" },
  { value: "unavailable", label: "Not currently available" },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;
type TalentCard = {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  avatar_url: string | null;
  town: string | null;
  experience_years: number | null;
  skills: string[];
  availability_status: string;
  category: { name: string } | null;
  county: { name: string } | null;
};
type TalentQueryRow = Omit<TalentCard, "category" | "county"> & {
  avatar_path: string | null;
  avatar_bucket: string | null;
  category: { name: string } | { name: string }[] | null;
  county: { name: string } | { name: string }[] | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value: string | undefined, minimum: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function availabilityLabel(value: string) {
  return AVAILABILITY_OPTIONS.find((option) => option.value === value)?.label ?? "Availability not set";
}

function buildPageHref(searchParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(searchParams);
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  return `/discover${params.size ? `?${params.toString()}` : ""}`;
}

async function DiscoverContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = (firstParam(params.q) ?? "").trim().slice(0, 120);
  const skill = (firstParam(params.skill) ?? "").trim().slice(0, 80);
  const town = (firstParam(params.town) ?? "").trim().slice(0, 120);
  const categoryName = firstParam(params.category) ?? "";
  const countyId = firstParam(params.county) ?? "";
  const availability = firstParam(params.availability) ?? "";
  const minimumExperience = boundedInteger(firstParam(params.minExperience), 0, MAX_EXPERIENCE);
  const maximumExperience = boundedInteger(firstParam(params.maxExperience), 0, MAX_EXPERIENCE);
  const requestedPage = boundedInteger(firstParam(params.page), 1, 1000) ?? 1;
  const validAvailability = AVAILABILITY_OPTIONS.some((option) => option.value === availability) ? availability : "";

  const supabase = await createSupabaseServerClient();
  const [
    { data: categoryRows, error: categoriesError },
    { data: countyRows, error: countiesError },
  ] = await Promise.all([
    supabase.from("talent_categories").select("id,name").order("name"),
    supabase.from("counties").select("id,name").order("name"),
  ]);
  if (categoriesError) throw new Error(`Could not load talent categories: ${categoriesError.message}`);
  if (countiesError) throw new Error(`Could not load counties: ${countiesError.message}`);

  const categories = (categoryRows ?? []).filter((category) =>
    DISCOVERY_CATEGORIES.includes(category.name as (typeof DISCOVERY_CATEGORIES)[number]),
  );
  const selectedCategory = categories.find((category) => category.name === categoryName);
  const selectedCounty = (countyRows ?? []).find((county) => String(county.id) === countyId);
  const invalidExperienceRange = minimumExperience !== null && maximumExperience !== null && minimumExperience > maximumExperience;

  let total = 0;
  let talents: TalentCard[] = [];
  if (!invalidExperienceRange) {
    let query = supabase
      .from("profiles")
      .select(
        "id,display_name,headline,bio,avatar_path,avatar_bucket,town,experience_years,skills,availability_status,category:talent_categories!profiles_primary_category_id_fkey(name),county:counties(name)",
        { count: "exact" },
      )
      .eq("is_public", true)
      .order("display_name", { ascending: true });

    if (selectedCategory) query = query.eq("primary_category_id", selectedCategory.id);
    if (selectedCounty) query = query.eq("county_id", selectedCounty.id);
    if (town) query = query.ilike("town", `%${escapeLikePattern(town)}%`);
    if (minimumExperience !== null) query = query.gte("experience_years", minimumExperience);
    if (maximumExperience !== null) query = query.lte("experience_years", maximumExperience);
    if (validAvailability) query = query.eq("availability_status", validAvailability);
    if (search) query = query.textSearch("search_document", search, { type: "websearch", config: "simple" });
    if (skill) query = query.textSearch("search_document", skill, { type: "plain", config: "simple" });

    const offset = (requestedPage - 1) * PAGE_SIZE;
    const { data, error, count } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not discover talent: ${error.message}`);
    total = count ?? 0;
    const avatarUrls = await signAvatarUrls(supabase, (data ?? []) as TalentQueryRow[]);
    talents = ((data ?? []) as unknown as TalentQueryRow[]).map((talent) => ({
      ...talent,
      avatar_url: avatarUrls.get(talent.id) ?? null,
      category: Array.isArray(talent.category) ? talent.category[0] ?? null : talent.category,
      county: Array.isArray(talent.county) ? talent.county[0] ?? null : talent.county,
    }));
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  if (page !== requestedPage && total > 0) {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && typeof value === "string" && value) nextParams.set(key, value);
    }
    const href = buildPageHref(nextParams, page);
    redirect(href);
  }

  const currentSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) currentSearchParams.set(key, value);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">talanta<span>link</span><small>HOME OF TALENTS</small></Link>
        <Link className={styles.topLink} href="/auth">Join TalantaLink <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>DISCOVER KENYAN CREATIVITY</p>
        <h1>Find the talent<br /><span>you’re looking for.</span></h1>
        <p className={styles.intro}>Explore skilled people across Kenya, ready to bring their experience and ideas to your next opportunity.</p>
        <div className={styles.trustLine}><span aria-hidden="true">✦</span> A community of talent, all in one place</div>
      </section>

      <div className={styles.content}>
        <aside className={styles.filterPanel}>
          <div className={styles.filterHeading}>
            <div><p className={styles.eyebrow}>REFINE YOUR SEARCH</p><h2>Filters</h2></div>
            <Link href="/discover" className={styles.resetLink}>Clear all</Link>
          </div>
          <form action="/discover" method="get" className={styles.filterForm}>
            <label className={styles.field}>
              <span>Search talents</span>
              <input name="q" type="search" defaultValue={search} placeholder="Name, role or keyword" maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Category</span>
              <select name="category" defaultValue={selectedCategory?.name ?? ""}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Skill</span>
              <input name="skill" type="search" defaultValue={skill} placeholder="e.g. photography" maxLength={80} />
            </label>
            <label className={styles.field}>
              <span>County</span>
              <select name="county" defaultValue={selectedCounty ? String(selectedCounty.id) : ""}>
                <option value="">All counties</option>
                {(countyRows ?? []).map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Town</span>
              <input name="town" type="search" defaultValue={town} placeholder="e.g. Nairobi" maxLength={120} />
            </label>
            <fieldset className={styles.experience}>
              <legend>Years of experience</legend>
              <label className={styles.field}><span className={styles.visuallyHidden}>Minimum years</span>
                <input name="minExperience" type="number" min="0" max={MAX_EXPERIENCE} defaultValue={minimumExperience ?? ""} placeholder="Min" />
              </label>
              <span className={styles.rangeDash}>to</span>
              <label className={styles.field}><span className={styles.visuallyHidden}>Maximum years</span>
                <input name="maxExperience" type="number" min="0" max={MAX_EXPERIENCE} defaultValue={maximumExperience ?? ""} placeholder="Max" />
              </label>
            </fieldset>
            <label className={styles.field}>
              <span>Availability</span>
              <select name="availability" defaultValue={validAvailability}>
                <option value="">Any availability</option>
                {AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="submit" className={styles.submitButton}>Show talents <span aria-hidden="true">→</span></button>
          </form>
        </aside>

        <section className={styles.results} aria-labelledby="results-heading">
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.eyebrow}>THE TALANTALINK COMMUNITY</p>
              <h2 id="results-heading">Talents to know</h2>
            </div>
            <p className={styles.resultCount}><strong>{total.toLocaleString()}</strong> {total === 1 ? "talent" : "talents"} found</p>
          </div>

          {invalidExperienceRange ? (
            <div className={styles.emptyState}><span className={styles.emptyIcon} aria-hidden="true">↕</span><h3>Check your experience range</h3><p>The minimum number of years should not be greater than the maximum.</p></div>
          ) : talents.length === 0 ? (
            <div className={styles.emptyState}><span className={styles.emptyIcon} aria-hidden="true">⌕</span><h3>No matching talents yet</h3><p>Try broadening your search or clearing one of the filters.</p><Link href="/discover" className={styles.emptyLink}>See everyone <span aria-hidden="true">→</span></Link></div>
          ) : (
            <div className={styles.talentGrid}>
              {talents.map((talent) => (
                <article className={styles.talentCard} key={talent.id}>
                  <div className={styles.cardTop}>
                    <Link href={`/talent/${talent.id}`} className={styles.avatarLink} aria-label={`View ${talent.display_name}'s profile`}>
                      {talent.avatar_url
                        ? <Image className={styles.avatar} src={talent.avatar_url} alt="" width={64} height={64} unoptimized />
                        : <span className={styles.avatarFallback}>{initials(talent.display_name)}</span>}
                    </Link>
                    <span className={`${styles.availability} ${talent.availability_status === "unavailable" ? styles.notAvailable : ""}`}><i />{availabilityLabel(talent.availability_status)}</span>
                  </div>
                  <Link href={`/talent/${talent.id}`} className={styles.nameLink}><h3>{talent.display_name}</h3></Link>
                  <p className={styles.headline}>{talent.headline || talent.category?.name || "TalantaLink member"}</p>
                  <p className={styles.location}><span aria-hidden="true">⌖</span> {[talent.town, talent.county?.name].filter(Boolean).join(", ") || "Kenya"}</p>
                  <p className={styles.summary}>{talent.bio || "Discover this talent’s profile, experience and work."}</p>
                  <div className={styles.cardMeta}>
                    {talent.experience_years !== null && <span>{talent.experience_years} {talent.experience_years === 1 ? "year" : "years"} experience</span>}
                    {talent.category?.name && <span>{talent.category.name}</span>}
                  </div>
                  {talent.skills.length > 0 && <div className={styles.skills}>{talent.skills.slice(0, 3).map((item) => <span key={item}>{item}</span>)}{talent.skills.length > 3 && <span>+{talent.skills.length - 3}</span>}</div>}
                  <Link href={`/talent/${talent.id}`} className={styles.profileLink}>View profile <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          )}

          {total > PAGE_SIZE && (
            <nav className={styles.pagination} aria-label="Talent pages">
              {page <= 1
                ? <span className={styles.disabledPage}>← Previous</span>
                : <Link href={buildPageHref(currentSearchParams, page - 1)}>← Previous</Link>}
              <span>Page {page} of {pageCount}</span>
              {page >= pageCount
                ? <span className={styles.disabledPage}>Next →</span>
                : <Link href={buildPageHref(currentSearchParams, page + 1)}>Next →</Link>}
            </nav>
          )}
        </section>
      </div>
      <footer className={styles.footer}><Link href="/">talanta<span>link</span></Link><span>Discover your next great collaboration.</span></footer>
    </main>
  );
}

export default function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense
      fallback={
        <main className={styles.page} aria-busy="true">
          <header className={styles.topbar}>
            <Link className={styles.brand} href="/">talanta<span>link</span><small>HOME OF TALENTS</small></Link>
            <span className={styles.topLink}>Join TalantaLink</span>
          </header>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>DISCOVER KENYAN CREATIVITY</p>
            <h1>Find the talent<br /><span>you’re looking for.</span></h1>
            <p className={styles.intro}>Explore skilled people across Kenya, ready to bring their experience and ideas to your next opportunity.</p>
          </section>
          <div className={styles.loadingState} role="status">
            <span className={styles.loadingSpinner} aria-hidden="true" />
            Loading talents and filters…
          </div>
        </main>
      }
    >
      <DiscoverContent searchParams={searchParams} />
    </Suspense>
  );
}

export const metadata = {
  title: "Discover Kenyan talent",
  description: "Search Kenyan talent by skill, category, county, town, experience and availability.",
};
