"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type IconName =
  | "home"
  | "users"
  | "briefcase"
  | "message"
  | "sparkles"
  | "chart"
  | "search"
  | "bell"
  | "plus"
  | "image"
  | "heart"
  | "comment"
  | "share"
  | "bookmark"
  | "more"
  | "map"
  | "arrow"
  | "clock"
  | "filter"
  | "check"
  | "send"
  | "close"
  | "external";

type Section = "Home" | "My Network" | "Jobs" | "Messages" | "Investors" | "Ads";
type OpportunityType = "Job" | "Sponsorship" | "Collaboration";

type Profile = {
  id: string;
  display_name: string;
  headline: string;
  countyId: number | null;
  countyName: string;
};

type Person = {
  id?: string;
  name: string;
  role: string;
  county: string;
  talent: string;
  initials: string;
  tone: string;
  mutual: number;
};

type Opportunity = {
  id?: string;
  company: string;
  title: string;
  detail: string;
  type: OpportunityType;
  county: string;
  tag: string;
  initials: string;
  tone: string;
  pay?: string;
  deadline: string;
};

type FeedPost = {
  id: string | number;
  name: string;
  role: string;
  initials: string;
  tone: string;
  time: string;
  text: string;
  category: string;
  likes: number;
  comments: number;
  art: string;
};

type PostComment = {
  id: string;
  name: string;
  initials: string;
  text: string;
};

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase();
}

const counties = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];

const countyIds = [
  "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita-Taveta", "Garissa",
  "Wajir", "Mandera", "Marsabit", "Isiolo", "Meru", "Tharaka-Nithi", "Embu",
  "Kitui", "Machakos", "Makueni", "Nyandarua", "Nyeri", "Kirinyaga", "Murang'a",
  "Kiambu", "Turkana", "West Pokot", "Samburu", "Trans Nzoia", "Uasin Gishu",
  "Elgeyo-Marakwet", "Nandi", "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado",
  "Kericho", "Bomet", "Kakamega", "Vihiga", "Bungoma", "Busia", "Siaya", "Kisumu",
  "Homa Bay", "Migori", "Kisii", "Nyamira", "Nairobi",
];

const countyIdByName = new Map(countyIds.map((name, index) => [name, index + 1]));

const people: Person[] = [
  { name: "Wanjiku Njeri", role: "Illustrator & mural artist", county: "Nairobi", talent: "Visual arts", initials: "WN", tone: "rose", mutual: 12 },
  { name: "Brian Kiptoo", role: "Middle-distance runner", county: "Uasin Gishu", talent: "Athletics", initials: "BK", tone: "green", mutual: 8 },
  { name: "Amina Abdalla", role: "Taarab vocalist", county: "Mombasa", talent: "Music", initials: "AA", tone: "blue", mutual: 5 },
  { name: "Kevin Ochieng", role: "Chess coach & player", county: "Kisumu", talent: "Board games", initials: "KO", tone: "gold", mutual: 4 },
  { name: "Faith Chebet", role: "Documentary photographer", county: "Nakuru", talent: "Photography", initials: "FC", tone: "violet", mutual: 3 },
  { name: "Juma Mwakio", role: "Wood carver & artisan", county: "Taita-Taveta", talent: "Craft", initials: "JM", tone: "orange", mutual: 2 },
];

const opportunities: Opportunity[] = [
  { company: "Kifaru Athletics", title: "Community running ambassadors", detail: "Looking for runners to represent a new youth athletics programme.", type: "Sponsorship", county: "Nationwide", tag: "Athletics", initials: "KA", tone: "green", pay: "Stipend available", deadline: "Closes 18 Nov" },
  { company: "Studio Sanaa", title: "Live mural artists", detail: "Create a collaborative public artwork for a community culture festival.", type: "Collaboration", county: "Nairobi", tag: "Visual arts", initials: "SS", tone: "violet", deadline: "Closes 24 Nov" },
  { company: "Pwani Creative", title: "Event photographer", detail: "Capture a two-day arts and music gathering. Portfolio required.", type: "Job", county: "Mombasa", tag: "Photography", initials: "PC", tone: "blue", pay: "KES 18,000", deadline: "Closes 12 Nov" },
  { company: "Lake Region Chess", title: "Junior chess coach", detail: "Coach beginner groups at weekend sessions across local schools.", type: "Job", county: "Kisumu", tag: "Board games", initials: "LR", tone: "gold", pay: "KES 2,500 / day", deadline: "Closes 30 Nov" },
];

const initialPosts: FeedPost[] = [
  {
    id: 1,
    name: "Brian Kiptoo",
    role: "Runner · Uasin Gishu",
    initials: "BK",
    tone: "green",
    time: "2 hours ago",
    text: "A personal best is never just a number. It is the early mornings, the people who show up, and the decision to keep going. Grateful for this team. 🏃🏾",
    category: "Athletics",
    likes: 48,
    comments: 9,
    art: "run",
  },
  {
    id: 2,
    name: "Wanjiku Njeri",
    role: "Illustrator · Nairobi",
    initials: "WN",
    tone: "rose",
    time: "Yesterday",
    text: "Sketchbook to street wall. Sharing a few details from my latest neighbourhood mural — inspired by the plants and stories that make this block home.",
    category: "Visual arts",
    likes: 73,
    comments: 14,
    art: "mural",
  },
];

const navItems: { label: Section; icon: IconName }[] = [
  { label: "Home", icon: "home" },
  { label: "My Network", icon: "users" },
  { label: "Jobs", icon: "briefcase" },
  { label: "Messages", icon: "message" },
  { label: "Investors", icon: "sparkles" },
  { label: "Ads", icon: "chart" },
];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
    sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14ZM5 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /><path d="M15 9h4v4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></>,
    comment: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.7 6.8-4.4m-6.8 7 6.8 4.4" /></>,
    bookmark: <><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    external: <><path d="M14 3h7v7m-1-6-9 9" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></>,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Avatar({ initials, tone, size = "normal", image }: { initials: string; tone: string; size?: "normal" | "small" | "large"; image?: string }) {
  return <div className={`avatar avatar-${tone} avatar-${size}`}>{image ? <Image className="avatar-image" src={image} alt="" width={40} height={40} /> : initials}</div>;
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => configured ? createSupabaseBrowserClient() : null, [configured]);
  const [section, setSection] = useState<Section>("Home");
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("All counties");
  const [opportunityType, setOpportunityType] = useState("All types");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remotePeople, setRemotePeople] = useState<Person[] | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, string>>({});
  const [liked, setLiked] = useState<Array<string | number>>([]);
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [openComments, setOpenComments] = useState<string | number | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [remoteOpportunities, setRemoteOpportunities] = useState<Opportunity[] | null>(null);
  const [postText, setPostText] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [adActive, setAdActive] = useState(true);
  const [messageSent, setMessageSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dataError, setDataError] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const loadVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

  const visiblePeople = remotePeople ?? people;
  const visibleOpportunities = remoteOpportunities ?? opportunities;
  const connectionCount = Object.values(connectionStatus).filter((status) => status === "connected").length;
  const invitationCount = Object.values(connectionStatus).filter((status) => status === "incoming").length;

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const loadUserData = async (userId: string | null) => {
      const version = ++loadVersion.current;
      setPosts([]);
      setLiked([]);
      setCommentsByPost({});
      setOpenComments(null);
      setRemotePeople([]);
      setRemoteOpportunities([]);
      setLoadingData(true);
      setDataError("");
      try {
        const [countyResult, profileResult, connectionResult, postResult, opportunityResult] = await Promise.all([
          supabase.from("counties").select("id,name"),
          userId
            ? supabase.from("profiles").select("id,display_name,headline,county_id").eq("id", userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          userId
            ? supabase.from("connections").select("requester_id,receiver_id,status").or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("posts").select("id,user_id,content,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(30),
          supabase.from("opportunities").select("id,title,description,type,county_id,talent_id,compensation,deadline,companies(name),counties(name),talents(name)").eq("status", "published").order("created_at", { ascending: false }).limit(30),
        ]);
        for (const result of [countyResult, profileResult, connectionResult, postResult, opportunityResult]) {
          if (result.error) throw result.error;
        }
        if (!active || version !== loadVersion.current) return;

        const countyNames = new Map((countyResult.data ?? []).map((entry) => [entry.id, entry.name]));
        if (profileResult.data) {
          setProfile({
            id: profileResult.data.id,
            display_name: profileResult.data.display_name,
            headline: profileResult.data.headline,
            countyId: profileResult.data.county_id,
            countyName: profileResult.data.county_id ? countyNames.get(profileResult.data.county_id) ?? "Kenya" : "Kenya",
          });
        } else {
          setProfile(null);
        }

        const statuses: Record<string, string> = {};
        for (const connection of connectionResult.data ?? []) {
          const otherUserId = connection.requester_id === userId ? connection.receiver_id : connection.requester_id;
          statuses[otherUserId] = connection.status === "accepted"
            ? "connected"
            : connection.status === "rejected"
              ? connection.requester_id === userId ? "rejected" : "declined"
              : connection.requester_id === userId ? "pending" : "incoming";
        }
        setConnectionStatus(statuses);

        const feedRows = postResult.data ?? [];
        if (feedRows.length) {
          const postIds = feedRows.map((post) => post.id);
          const userIds = [...new Set(feedRows.map((post) => post.user_id))];
          const [profilesResult, likesResult, commentsResult] = await Promise.all([
            supabase.from("profiles").select("id,display_name,headline,county_id").in("id", userIds),
            supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
            supabase.from("comments").select("post_id").in("post_id", postIds),
          ]);
          for (const result of [profilesResult, likesResult, commentsResult]) {
            if (result.error) throw result.error;
          }
          if (!active || version !== loadVersion.current) return;
          const profileById = new Map((profilesResult.data ?? []).map((entry) => [entry.id, entry]));
          const likeCounts = new Map<string, number>();
          const commentCounts = new Map<string, number>();
          for (const like of likesResult.data ?? []) likeCounts.set(like.post_id, (likeCounts.get(like.post_id) ?? 0) + 1);
          for (const comment of commentsResult.data ?? []) commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) ?? 0) + 1);
          setLiked((likesResult.data ?? []).filter((like) => like.user_id === userId).map((like) => like.post_id));
          setPosts(feedRows.map((post) => {
            const author = profileById.get(post.user_id);
            const displayName = author?.display_name ?? "TalantaLink member";
            return {
              id: post.id,
              name: displayName,
              role: [author?.headline, author?.county_id ? countyNames.get(author.county_id) : null].filter(Boolean).join(" · ") || "TalantaLink community",
              initials: getInitials(displayName),
              tone: "green",
              time: new Date(post.created_at).toLocaleDateString(),
              text: post.content,
              category: "Community",
              likes: likeCounts.get(post.id) ?? 0,
              comments: commentCounts.get(post.id) ?? 0,
              art: "",
            };
          }));
        } else {
          setPosts([]);
          setLiked([]);
        }

        const peopleQuery = supabase.from("profiles").select("id,display_name,headline,county_id");
        const peopleResult = await (userId ? peopleQuery.neq("id", userId) : peopleQuery).limit(30);
        if (peopleResult.error) throw peopleResult.error;
        if (!active || version !== loadVersion.current) return;
        setRemotePeople((peopleResult.data ?? []).map((entry, index) => ({
          id: entry.id,
          name: entry.display_name,
          role: entry.headline || "TalantaLink member",
          county: entry.county_id ? countyNames.get(entry.county_id) ?? "Kenya" : "Kenya",
          talent: entry.headline || "Talent",
          initials: getInitials(entry.display_name),
          tone: ["green", "rose", "blue", "gold", "violet", "orange"][index % 6],
          mutual: 0,
        })));

        const mappedOpportunities = (opportunityResult.data ?? []).map((entry) => {
          const company = Array.isArray(entry.companies) ? entry.companies[0] : entry.companies;
          const countyRow = Array.isArray(entry.counties) ? entry.counties[0] : entry.counties;
          const talent = Array.isArray(entry.talents) ? entry.talents[0] : entry.talents;
          const companyName = company?.name ?? "Company";
          return {
            id: entry.id,
            company: companyName,
            title: entry.title,
            detail: entry.description,
            type: (entry.type.charAt(0).toUpperCase() + entry.type.slice(1)) as OpportunityType,
            county: countyRow?.name ?? "Nationwide",
            tag: talent?.name ?? "All talents",
            initials: getInitials(companyName),
            tone: "green",
            pay: entry.compensation ?? undefined,
            deadline: entry.deadline ? `Closes ${new Date(entry.deadline).toLocaleDateString()}` : "Open",
          };
        });
        setRemoteOpportunities(mappedOpportunities);
        if (userId && mappedOpportunities.length) {
          const { data: applicationRows, error: applicationError } = await supabase
            .from("applications").select("opportunity_id").eq("applicant_id", userId);
          if (applicationError) throw applicationError;
          if (active && version === loadVersion.current) setApplied((applicationRows ?? []).map((application) => application.opportunity_id));
        } else {
          setApplied([]);
        }
      } catch (error) {
        if (active && version === loadVersion.current) setDataError(error instanceof Error ? error.message : "Could not load data from Supabase.");
      } finally {
        if (active && version === loadVersion.current) setLoadingData(false);
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setDataError(error.message);
        return;
      }
      const userId = data.session?.user.id ?? null;
      setCurrentUserId(userId);
      void loadUserData(userId);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const userId = session?.user.id ?? null;
      setCurrentUserId(userId);
      window.setTimeout(() => { if (active) void loadUserData(userId); }, 0);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const filteredPeople = useMemo(() => visiblePeople.filter((person) => {
    const matchesCounty = county === "All counties" || person.county === county;
    const matchesQuery = `${person.name} ${person.role} ${person.talent} ${person.county}`.toLowerCase().includes(query.toLowerCase());
    return matchesCounty && matchesQuery;
  }), [county, query, visiblePeople]);

  const filteredOpportunities = useMemo(() => visibleOpportunities.filter((item) => {
    const matchesType = opportunityType === "All types" || item.type === opportunityType;
    const matchesCounty = county === "All counties" || item.county === county || item.county === "Nationwide";
    const matchesQuery = `${item.company} ${item.title} ${item.detail} ${item.tag} ${item.county}`.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesCounty && matchesQuery;
  }), [county, opportunityType, query, visibleOpportunities]);

  async function toggleConnection(person: Person) {
    if (!supabase) {
      const key = person.id ?? person.name;
      setConnectionStatus((current) => current[key] === "pending"
        ? Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key))
        : { ...current, [key]: "pending" });
      setFeedback("Demo connection request updated locally; sign in with Supabase to save it.");
      return;
    }
    if (!person.id) return;
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const status = connectionStatus[person.id];
      if (status === "pending") {
        const { error } = await supabase.from("connections").delete().eq("requester_id", currentUserId).eq("receiver_id", person.id);
        if (error) throw error;
        setConnectionStatus((current) => { const next = { ...current }; delete next[person.id!]; return next; });
      } else if (status === "incoming") {
        const { error } = await supabase.from("connections").update({ status: "accepted" }).eq("requester_id", person.id).eq("receiver_id", currentUserId);
        if (error) throw error;
        setConnectionStatus((current) => ({ ...current, [person.id!]: "connected" }));
      } else if (!status) {
        const { error } = await supabase.from("connections").insert({ requester_id: currentUserId, receiver_id: person.id });
        if (error) throw error;
        setConnectionStatus((current) => ({ ...current, [person.id!]: "pending" }));
      } else if (status === "rejected") {
        const { error: deleteError } = await supabase.from("connections").delete().eq("requester_id", currentUserId).eq("receiver_id", person.id);
        if (deleteError) throw deleteError;
        const { error } = await supabase.from("connections").insert({ requester_id: currentUserId, receiver_id: person.id });
        if (error) throw error;
        setConnectionStatus((current) => ({ ...current, [person.id!]: "pending" }));
      } else {
        setFeedback("You’re already connected.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update this connection.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = postText.trim();
    if (!content) return;
    if (supabase && !currentUserId) {
      router.push("/auth");
      return;
    }
    if (supabase && currentUserId) {
      setBusy(true);
      setFeedback("");
      try {
        const { data: createdPost, error } = await supabase.from("posts")
          .insert({ user_id: currentUserId, content }).select("id").single();
        if (error) throw error;
        const displayName = profile?.display_name ?? "You";
        setPosts((current) => [{
          id: createdPost.id,
          name: displayName,
          role: [profile?.headline, profile?.countyName].filter(Boolean).join(" · ") || "TalantaLink community",
          initials: getInitials(displayName),
          tone: "green",
          time: "Just now",
          text: content,
          category: "Community",
          likes: 0,
          comments: 0,
          art: "",
        }, ...current]);
        setFeedback("Your post was published.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not publish your post.");
        setBusy(false);
        return;
      }
      setPostText("");
      setPostOpen(false);
      setBusy(false);
      return;
    }
    setPosts((current) => [{
      id: Date.now(),
      name: "Alex Ouma",
      role: "Dancer & choreographer · Nairobi",
      initials: "AO",
      tone: "orange",
      time: "Just now",
      text: content,
      category: "Community",
      likes: 0,
      comments: 0,
      art: "",
    }, ...current]);
    setPostText("");
    setPostOpen(false);
  }

  function submitAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdOpen(false);
  }

  async function toggleLike(postId: string | number) {
    if (!supabase || typeof postId === "number") {
      setLiked((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]);
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    try {
      const alreadyLiked = liked.includes(postId);
      const result = alreadyLiked
        ? await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId)
        : await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUserId });
      if (result.error) throw result.error;
      setLiked((current) => alreadyLiked ? current.filter((id) => id !== postId) : [...current, postId]);
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, likes: post.likes + (alreadyLiked ? -1 : 1) } : post));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update appreciation.");
    } finally {
      setBusy(false);
    }
  }

  async function showComments(postId: string | number) {
    setOpenComments((current) => current === postId ? null : postId);
    setCommentDraft("");
    if (!supabase || typeof postId === "number" || commentsByPost[String(postId)]) return;
    try {
      const { data: commentRows, error } = await supabase.from("comments")
        .select("id,user_id,content").eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      const userIds = [...new Set((commentRows ?? []).map((comment) => comment.user_id))];
      const { data: authors, error: authorError } = userIds.length
        ? await supabase.from("profiles").select("id,display_name").in("id", userIds)
        : { data: [], error: null };
      if (authorError) throw authorError;
      const names = new Map((authors ?? []).map((author) => [author.id, author.display_name]));
      setCommentsByPost((current) => ({
        ...current,
        [String(postId)]: (commentRows ?? []).map((comment) => {
          const name = names.get(comment.user_id) ?? "TalantaLink member";
          return { id: comment.id, name, initials: getInitials(name), text: comment.content };
        }),
      }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not load comments.");
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, postId: string | number) {
    event.preventDefault();
    const content = commentDraft.trim();
    if (!content) return;
    if (!supabase || typeof postId === "number") {
      setFeedback("Comments on demo posts aren’t saved.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const { data, error } = await supabase.from("comments")
        .insert({ post_id: postId, user_id: currentUserId, content })
        .select("id").single();
      if (error) throw error;
      const name = profile?.display_name ?? "You";
      setCommentsByPost((current) => ({
        ...current,
        [String(postId)]: [...(current[String(postId)] ?? []), { id: data.id, name, initials: getInitials(name), text: content }],
      }));
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, comments: post.comments + 1 } : post));
      setCommentDraft("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not add comment.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setFeedback(error.message);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supabase && !currentUserId) {
      router.push("/auth");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const countyValue = String(formData.get("county") ?? "");
    const countyId = countyIdByName.get(countyValue) ?? null;
    if (!displayName) return;

    if (supabase && currentUserId) {
      setBusy(true);
      setFeedback("");
      try {
        const { error } = await supabase.from("profiles")
          .update({ display_name: displayName, headline, county_id: countyId })
          .eq("id", currentUserId);
        if (error) throw error;
        const countyName = countyId ? countyIds[countyId - 1] ?? "Kenya" : "Kenya";
        setProfile({ id: currentUserId, display_name: displayName, headline, countyId, countyName });
        setFeedback("Profile updated.");
        setProfileOpen(false);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not update your profile.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setProfile({ id: "demo-profile", display_name: displayName, headline, countyId, countyName: countyId ? countyIds[countyId - 1] : "Kenya" });
    setFeedback("Demo profile updated in this session only.");
    setProfileOpen(false);
  }

  async function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setFeedback("Connect Supabase and sign in to publish real opportunities.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const companyName = String(formData.get("companyName") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const type = String(formData.get("type") ?? "job") as Lowercase<OpportunityType>;
    const countyValue = String(formData.get("county") ?? "");
    const countyId = countyIdByName.get(countyValue) ?? null;
    const compensation = String(formData.get("compensation") ?? "").trim() || null;
    const deadlineValue = String(formData.get("deadline") ?? "");
    setBusy(true);
    setFeedback("");
    try {
      const companyResult = await supabase.from("companies").select("id")
        .eq("owner_id", currentUserId).eq("name", companyName).maybeSingle();
      if (companyResult.error) throw companyResult.error;
      let companyId = companyResult.data?.id;
      if (!companyId) {
        const { data: createdCompany, error: companyError } = await supabase.from("companies").insert({
          owner_id: currentUserId,
          name: companyName,
        }).select("id").single();
        if (companyError) throw companyError;
        companyId = createdCompany.id;
      }
      const { data: created, error } = await supabase.from("opportunities").insert({
        company_id: companyId,
        title,
        description,
        type,
        county_id: countyId,
        compensation,
        deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null,
        status: "published",
      }).select("id").single();
      if (error) throw error;

      const countyName = countyId ? countyIds[countyId - 1] ?? "Kenya" : "Nationwide";
      const newOpportunity: Opportunity = {
        id: created.id,
        company: companyName,
        title,
        detail: description,
        type: (type.charAt(0).toUpperCase() + type.slice(1)) as OpportunityType,
        county: countyName,
        tag: "All talents",
        initials: getInitials(companyName),
        tone: "green",
        pay: compensation ?? undefined,
        deadline: deadlineValue ? `Closes ${new Date(deadlineValue).toLocaleDateString()}` : "Open",
      };
      setRemoteOpportunities((current) => [newOpportunity, ...(current ?? [])]);
      setFeedback("Your opportunity is published.");
      setOpportunityOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not publish the opportunity.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleApply(item: Opportunity) {
    if (!item.id || !supabase) {
      setApplied((current) => current.includes(item.title) ? current.filter((entry) => entry !== item.title) : [...current, item.title]);
      setFeedback("This is a demo opportunity; applications aren’t submitted.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    const alreadyApplied = applied.includes(item.id);
    setBusy(true);
    setFeedback("");
    try {
      if (alreadyApplied) {
        const { error } = await supabase.from("applications").delete().eq("opportunity_id", item.id).eq("applicant_id", currentUserId);
        if (error) throw error;
        setApplied((current) => current.filter((id) => id !== item.id));
        setFeedback("Application withdrawn.");
      } else {
        const { error } = await supabase.from("applications").insert({ opportunity_id: item.id, applicant_id: currentUserId });
        if (error) throw error;
        setApplied((current) => [...current, item.id!]);
        setFeedback("Your application was submitted.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update your application.");
    } finally {
      setBusy(false);
    }
  }

  const countySelect = (
    <label className="select-wrap" aria-label="Filter by county">
      <Icon name="map" size={15} />
      <select value={county} onChange={(event) => setCounty(event.target.value)}>
        <option>All counties</option>
        {counties.map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>
  );

  const opportunityFilters = (
    <div className="filter-row">
      {["All types", "Job", "Sponsorship", "Collaboration"].map((item) => (
        <button key={item} className={`filter-chip ${opportunityType === item ? "selected" : ""}`} onClick={() => setOpportunityType(item)}>{item === "Job" ? "Jobs" : item}</button>
      ))}
    </div>
  );

  function renderPosts() {
    return (
      <>
        <form className={`composer card ${postOpen ? "composer-open" : ""}`} onSubmit={submitPost}>
          <div className="composer-top">
            <Avatar initials="AO" tone="orange" />
            <button type="button" className="composer-prompt" onClick={() => setPostOpen((open) => !open)}>
              Share an achievement, idea or opportunity...
            </button>
          </div>
          {postOpen && (
            <textarea autoFocus value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="What are you working on?" aria-label="Write a post" />
          )}
          <div className="composer-actions">
            <button type="button" className="quiet-button" onClick={() => setPostOpen(true)}><Icon name="image" size={17} /> Photo</button>
            <button type="button" className="quiet-button" onClick={() => setPostOpen(true)}><Icon name="sparkles" size={17} /> Opportunity</button>
            {postOpen ? <button className="primary-button compact" type="submit">Post <Icon name="arrow" size={15} /></button> : <button className="primary-button compact" type="button" onClick={() => setPostOpen(true)}>Write a post</button>}
          </div>
        </form>

        <div className="feed-heading"><span>Community feed</span><button type="button" className="sort-button">For you <span>⌄</span></button></div>
        {loadingData && <div className="empty-state card">Loading the community feed…</div>}
        {!loadingData && posts.length === 0 && <>
          <div className="empty-state card feed-empty-state">No posts yet. Share the first update with your community.</div>
          <article className="post card mobile-preview-post">
            <div className="post-header">
              <Avatar initials="BK" tone="green" image="/brian-kimani.jpg" />
              <div className="post-author"><strong>Brian Kimani <span className="preview-label">SAMPLE</span></strong><span>Pool champion · Nairobi</span><small>2h <span>·</span> <span className="public-dot">●</span></small></div>
              <button className="icon-button post-more" aria-label="Sample post preview"><Icon name="more" /></button>
            </div>
            <p className="post-copy">I’m thrilled to share that I won the Nairobi County Pool Championship! This journey has been amazing, and I’m grateful for everyone who supported me. 🎱</p>
            <Image className="mobile-preview-image" src="/pool-championship.jpg" alt="Pool championship tournament" width={321} height={133} sizes="(max-width: 720px) 100vw, 321px" loading="eager" />
            <div className="post-stats"><span>24 appreciations</span><span>8 comments · 3 shares</span></div>
            <div className="post-actions">
              <button disabled><Icon name="heart" size={17} /> Appreciate</button>
              <button disabled><Icon name="comment" size={17} /> Comment</button>
              <button disabled><Icon name="share" size={17} /> Share</button>
            </div>
            <div className="mobile-preview-comment">
              <Avatar initials="AW" tone="rose" size="small" image="/aisha-wanjiku.jpg" />
              <p><strong>Aisha Wanjiku</strong><span>Congratulations Brian! Well deserved 🎱</span></p>
            </div>
          </article>
          <section className="mobile-suggestions card">
            <div className="mobile-suggestions-heading"><h2>Talent you may know</h2><button onClick={() => setSection("My Network")}>See all</button></div>
            <div className="mobile-suggestion">
              <Avatar initials="AW" tone="rose" image="/aisha-wanjiku.jpg" />
              <span><strong>Aisha Wanjiku <span className="preview-label">SAMPLE</span></strong><small>Visual artist · Nairobi</small></span>
              <button type="button" onClick={() => setSection("My Network")}>Connect</button>
            </div>
            <div className="mobile-suggestion">
              <Avatar initials="GO" tone="blue" image="/grace-otieno.jpg" />
              <span><strong>Grace Otieno <span className="preview-label">SAMPLE</span></strong><small>Photographer · Kisumu</small></span>
              <button type="button" onClick={() => setSection("My Network")}>Connect</button>
            </div>
          </section>
        </>}
        {posts.map((post) => {
          const isLiked = liked.includes(post.id);
          return (
            <article className="post card" key={post.id}>
              <div className="post-header">
                <Avatar initials={post.initials} tone={post.tone} />
                <div className="post-author"><strong>{post.name}</strong><span>{post.role}</span><small>{post.time} <span>·</span> <span className="public-dot">●</span></small></div>
                <button className="icon-button post-more" aria-label="More post options"><Icon name="more" /></button>
              </div>
              <p className="post-copy">{post.text}</p>
              {post.art && <div className={`post-art post-art-${post.art}`} aria-label={`${post.category} showcase artwork`}>
                <div className="art-caption"><span>{post.category}</span><strong>{post.art === "run" ? "The work behind the moment." : "Colour belongs to everyone."}</strong></div>
                <span className="art-mark">{post.art === "run" ? "RUN / 01" : "SANA / 24"}</span>
              </div>}
              <div className="post-stats"><span>{post.likes + (isLiked ? 1 : 0)} appreciations</span><span>{post.comments} comments · 3 shares</span></div>
              <div className="post-actions">
                <button className={isLiked ? "liked" : ""} onClick={() => void toggleLike(post.id)}><Icon name="heart" size={17} /> Appreciate</button>
                <button onClick={() => void showComments(post.id)}><Icon name="comment" size={17} /> Comment</button>
                <button><Icon name="share" size={17} /> Share</button>
              </div>
              {openComments === post.id && <div className="comments-panel">
                {(commentsByPost[String(post.id)] ?? []).map((comment) => <div className="comment-row" key={comment.id}><Avatar initials={comment.initials} tone="green" size="small" /><p><strong>{comment.name}</strong><span>{comment.text}</span></p></div>)}
                {!supabase && <p className="comment-hint">Sign in with Supabase to add comments to published posts.</p>}
                <form className="comment-form" onSubmit={(event) => void submitComment(event, post.id)}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder={supabase ? "Write a comment..." : "Comments require a connected account"} aria-label="Write a comment" disabled={!supabase || busy} /><button type="submit" disabled={!supabase || busy || !commentDraft.trim()} aria-label="Submit comment"><Icon name="send" size={15} /></button></form>
              </div>}
            </article>
          );
        })}
      </>
    );
  }

  function renderPeople() {
    return (
      <>
        <SectionTitle eyebrow="Find your people" title="My Network" action={<button className="outline-button"><Icon name="users" size={16} /> My connections</button>} />
        <div className="network-summary card">
          <div><span className="summary-number">{supabase ? connectionCount : 248}</span><span>connections</span></div>
          <div><span className="summary-number">{supabase ? invitationCount : 12}</span><span>new invitations</span></div>
          <p>Good things happen when talent meets talent. Build your circle across Kenya.</p>
        </div>
        <div className="list-toolbar"><div><h2>People you may know</h2><p>Meet creatives, makers and athletes in your community.</p></div>{countySelect}</div>
        <div className="people-grid">
          {loadingData && <div className="empty-state card">Loading people from the community…</div>}
          {filteredPeople.map((person) => {
            const status = connectionStatus[person.id ?? person.name];
            const label = status === "connected" ? "Connected" : status === "incoming" ? "Accept request" : status === "pending" ? "Requested" : status === "declined" ? "Request declined" : "Connect";
            return (
            <article className="person-card card" key={person.name}>
              <div className={`person-cover cover-${person.tone}`}><span className="cover-star">✳</span></div>
              <Avatar initials={person.initials} tone={person.tone} size="large" />
              <div className="person-info"><strong>{person.name}</strong><span>{person.role}</span><small><Icon name="map" size={13} /> {person.county} County</small><p>{person.mutual} mutual connections</p></div>
              <button className={`connect-button ${status ? "is-connected" : ""}`} disabled={busy || status === "connected" || status === "declined"} onClick={() => void toggleConnection(person)}>
                <Icon name={status === "incoming" || status === "connected" ? "check" : "plus"} size={16} /> {label}
              </button>
            </article>
          );})}
          {filteredPeople.length === 0 && <div className="empty-state card">No people match those filters yet. Try another county or search.</div>}
        </div>
      </>
    );
  }

  function renderOpportunities(title: "Jobs" | "Investors") {
    const isJobs = title === "Jobs";
    const list = isJobs ? filteredOpportunities.filter((item) => item.type === "Job") : filteredOpportunities;
    const sectionAction = (
      <div className="title-actions">
        {countySelect}
        <button className="primary-button" onClick={() => currentUserId ? setOpportunityOpen(true) : router.push("/auth")}>
          <Icon name="plus" size={16} /> Post an opportunity
        </button>
      </div>
    );
    return (
      <>
        <SectionTitle eyebrow={isJobs ? "Make your next move" : "For companies & supporters"} title={isJobs ? "Jobs & gigs" : "Opportunities"} action={sectionAction} />
        {!isJobs && <p className="page-intro">Discover organisations looking to work with Kenya&apos;s next generation of talent.</p>}
        {opportunityFilters}
        <div className="opportunity-list">
          {loadingData && <div className="empty-state card">Loading published opportunities…</div>}
          {list.map((item) => {
            const isApplied = applied.includes(item.id ?? item.title);
            return (
            <article className="opportunity-card card" key={item.title}>
              <div className={`company-mark mark-${item.tone}`}>{item.initials}</div>
              <div className="opportunity-content">
                <div className="opportunity-company">{item.company} <span className="verified-mark">✓</span></div>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <div className="opportunity-meta"><span><Icon name="map" size={14} /> {item.county}</span><span className="tag">{item.tag}</span><span className={`type-label type-${item.type.toLowerCase()}`}>{item.type}</span></div>
              </div>
              <div className="opportunity-apply">
                <strong>{item.pay ?? "Open opportunity"}</strong>
                <span><Icon name="clock" size={13} /> {item.deadline}</span>
                <button className={isApplied ? "outline-button applied" : "primary-button"} disabled={busy} onClick={() => void toggleApply(item)}>
                  {isApplied ? <><Icon name="check" size={15} /> {item.id ? "Applied" : "Demo saved"}</> : item.id ? "Apply" : "Demo listing"}
                </button>
              </div>
            </article>
          );})}
          {list.length === 0 && <div className="empty-state card">No opportunities match these filters. Try another category or county.</div>}
        </div>
      </>
    );
  }

  function renderAds() {
    return (
      <>
        <SectionTitle eyebrow="For your brand" title="Campaign dashboard" action={<button className="primary-button" onClick={() => setAdOpen(true)}><Icon name="plus" size={17} /> Create campaign</button>} />
        <p className="page-intro">A simple overview of how your campaigns are reaching talent. Metrics below are sample demo data.</p>
        <div className="metrics-grid">
          <div className="metric-card card"><span>Impressions</span><strong>12,540</strong><small className="metric-up">↗ 12.8% <span>vs. last month</span></small></div>
          <div className="metric-card card"><span>Clicks</span><strong>420</strong><small className="metric-up">↗ 8.2% <span>vs. last month</span></small></div>
          <div className="metric-card card"><span>Click-through rate</span><strong>3.35%</strong><small>Across active campaigns</small></div>
          <div className="metric-card card"><span>Active campaigns</span><strong>{adActive ? "3" : "2"}</strong><small>{adActive ? "Campaigns are running" : "One campaign paused"}</small></div>
        </div>
        <div className="card campaign-panel">
          <div className="panel-heading"><div><h2>Your campaigns</h2><p>Manage your current placements.</p></div><button className="quiet-button" onClick={() => setAdActive((active) => !active)}>{adActive ? "Pause one campaign" : "Resume campaign"}</button></div>
          {[
            ["Find the next sound", "Music · Nairobi & Mombasa", "8,240", "2.9%", "Live", "violet"],
            ["Local running series", "Athletics · Nationwide", "4,300", "3.8%", adActive ? "Live" : "Paused", "green"],
            ["Makers market callout", "Craft · Kisumu", "1,860", "2.1%", "In review", "orange"],
          ].map(([name, target, impressions, ctr, status, tone]) => (
            <div className="campaign-row" key={name}><span className={`campaign-dot dot-${tone}`} /><div className="campaign-name"><strong>{name}</strong><span>{target}</span></div><span className="campaign-stat"><strong>{impressions}</strong><small>Impressions</small></span><span className="campaign-stat"><strong>{ctr}</strong><small>CTR</small></span><span className={`status-pill status-${status.toLowerCase().replace(" ", "-")}`}>{status}</span></div>
          ))}
        </div>
        <div className="notice-card"><Icon name="sparkles" size={18} /><p><strong>Just getting started?</strong> Campaign performance shown here is illustrative. Connect an account to see real delivery and billing.</p></div>
      </>
    );
  }

  function renderMessages() {
    return (
      <>
        <SectionTitle eyebrow="Your conversations" title="Messages" />
        <div className="messages-layout card">
          <div className="conversation-list">
            <div className="conversation-search"><Icon name="search" size={15} /><input placeholder="Search messages" aria-label="Search messages" /></div>
            {[
              ["Wanjiku Njeri", "Would love to hear more about the showcase!", "WN", "rose", "10:42"],
              ["Kifaru Athletics", "Thanks for connecting. Here are the details...", "KA", "green", "Yesterday"],
              ["Amina Abdalla", "That sounds like a great collaboration.", "AA", "blue", "Mon"],
            ].map(([name, message, initials, tone, time], index) => (
              <button className={`conversation ${index === 0 ? "conversation-active" : ""}`} key={name} onClick={() => setMessageSent(false)}>
                <Avatar initials={initials} tone={tone} /><span className="conversation-copy"><strong>{name}</strong><small>{message}</small></span><time>{time}</time>
              </button>
            ))}
          </div>
          <div className="chat-panel">
            <div className="chat-header"><Avatar initials="WN" tone="rose" size="small" /><span><strong>Wanjiku Njeri</strong><small>Illustrator · Nairobi</small></span></div>
            <div className="chat-body"><span className="chat-date">TODAY</span><div className="message-bubble received">Hey Alex! I saw your post about the showcase. Would love to hear more about it.</div><div className="message-bubble sent">{messageSent ? "Thanks, I’ll send over the details shortly!" : "Hi Wanjiku! I’m glad it caught your eye. We’re bringing local artists together next month."}</div></div>
            <div className="chat-compose"><input placeholder="Write a message..." aria-label="Write a message" onKeyDown={(event) => { if (event.key === "Enter") setMessageSent(true); }} /><button aria-label="Send message" onClick={() => setMessageSent(true)}><Icon name="send" size={17} /></button></div>
          </div>
        </div>
      </>
    );
  }

  const renderMain = () => {
    if (section === "My Network") return renderPeople();
    if (section === "Jobs") return renderOpportunities("Jobs");
    if (section === "Investors") return renderOpportunities("Investors");
    if (section === "Ads") return renderAds();
    if (section === "Messages") return renderMessages();
    return (
      <>
        <div className="welcome-strip"><span className="welcome-kicker">HOME OF TALENTS · KENYA</span><h1>Your talent has a place here.</h1><p>Meet your community, share what you do, and find your next opportunity.</p></div>
        {renderPosts()}
      </>
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setSection("Home"); }} aria-label="TalantaLink home">
          <span className="brand-shield"><Image src="/kenya-flag.svg" alt="" width={35} height={39} priority /></span>
          <span className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></span>
        </a>
        <label className="global-search"><Icon name="search" size={17} /><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search talent, skills, opportunities..." aria-label="Search TalantaLink" /><kbd>Ctrl K</kbd></label>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.filter((item) => item.label !== "Investors" && item.label !== "Ads").map((item) => (
            <button key={item.label} aria-label={item.label} title={item.label} className={section === item.label ? "desktop-nav-active" : ""} onClick={() => setSection(item.label)}>
              <Icon name={item.icon} size={19} />
              <span>{item.label === "My Network" ? "Network" : item.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-actions"><span className="demo-badge"><span /> {configured ? currentUserId ? "CONNECTED" : "SUPABASE" : "DEMO"}</span><button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell" size={19} /><i /></button><div className="topbar-divider" />{currentUserId && supabase ? <button className="profile-menu" onClick={() => void signOut()}><Avatar initials={profile ? getInitials(profile.display_name) : "TL"} tone="green" size="small" /><span>{profile?.display_name ?? "Account"}</span><span className="chevron">↪</span></button> : <Link className="profile-menu" href="/auth"><Avatar initials="AO" tone="orange" size="small" /><span>Sign in</span><span className="chevron">→</span></Link>}</div>
      </header>

      <div className="app-layout">
        <aside className="left-sidebar">
          <div className="sidebar-profile card">
            <div className="profile-cover"><span>✳</span><span>✳</span><span>✳</span></div>
            <Avatar initials="AO" tone="orange" size="large" />
            <div className="sidebar-profile-info"><strong>{profile?.display_name ?? "Alex Ouma"}</strong><span>{profile?.headline || "Dancer & choreographer"}</span><small><Icon name="map" size={13} /> {profile?.countyName ?? "Nairobi"}, Kenya</small></div>
            <div className="profile-tags"><span>Dance</span><span>Choreography</span><span>+2</span></div>
            <div className="profile-stats"><div><strong>{supabase && currentUserId ? "—" : "1.2k"}</strong><span>Profile views</span></div><div><strong>{supabase && currentUserId ? "—" : "860"}</strong><span>Post reach</span></div></div>
            <div className="open-to"><span className="open-dot" /> Open to opportunities</div>
            <button className="profile-edit" onClick={() => setProfileOpen(true)}>Edit your profile <Icon name="arrow" size={14} /></button>
          </div>
          <nav className="side-nav" aria-label="Main navigation">
            <p className="nav-label">EXPLORE</p>
            {navItems.filter((item) => item.label === "Investors" || item.label === "Ads").map((item) => <button key={item.label} className={`nav-item ${section === item.label ? "nav-active" : ""}`} onClick={() => setSection(item.label)}><Icon name={item.icon} size={18} /><span>{item.label === "Investors" ? "Funding & partners" : "Promote your work"}</span></button>)}
          </nav>
          <div className="sidebar-promo">
            <span className="promo-icon"><Icon name="sparkles" size={17} /></span>
            <strong>Good work deserves to be seen.</strong>
            <p>Share your profile with someone who can help your talent grow.</p>
            <button onClick={() => setSection("My Network")}>Grow your network <Icon name="arrow" size={14} /></button>
          </div>
          <div className="sidebar-footer">About <span>·</span> Guidelines <span>·</span> Privacy<br />© 2026 TalantaLink Kenya</div>
        </aside>

        <section className={`main-content main-${section.toLowerCase().replace(" ", "-")}`}>
          {dataError && <div className="data-feedback data-error" role="alert"><span>{dataError}</span><button onClick={() => setDataError("")} aria-label="Dismiss error"><Icon name="close" size={15} /></button></div>}
          {feedback && <div className="data-feedback" role="status"><span>{feedback}</span><button onClick={() => setFeedback("")} aria-label="Dismiss message"><Icon name="close" size={15} /></button></div>}
          {renderMain()}
        </section>

        <aside className="right-sidebar">
          <section className="right-card opportunities-widget">
            <div className="right-card-heading"><div><p className="eyebrow">A GOOD NEXT STEP</p><h2>Opportunities</h2></div><button className="text-icon-button" aria-label="View all opportunities" onClick={() => setSection("Investors")}><Icon name="arrow" size={17} /></button></div>
            {visibleOpportunities.slice(0, 3).map((item) => <button className="mini-opportunity" key={item.title} onClick={() => setSection(item.type === "Job" ? "Jobs" : "Investors")}><span className={`company-mark mini-mark mark-${item.tone}`}>{item.initials}</span><span><strong>{item.title}</strong><small>{item.company} · {item.county}</small></span><Icon name="arrow" size={14} /></button>)}
            <button className="view-all-link" onClick={() => setSection("Investors")}>Explore all opportunities <span>→</span></button>
          </section>
          <section className="ad-widget">
            <div className="ad-topline"><span>SPONSORED</span><Icon name="more" size={17} /></div>
            <div className="ad-art"><span className="ad-sun" /><span className="ad-line ad-line-one" /><span className="ad-line ad-line-two" /><span className="ad-copy">MAKE<br />SOME<br /><b>NOISE.</b></span><span className="ad-side-label">KIFARU / SOUND</span></div>
            <div className="ad-widget-body"><span className="campaign-tag">FOR THE CULTURE</span><h3>Big sound starts with your story.</h3><p>Discover an open call for emerging Kenyan musicians and sound artists.</p><button onClick={() => setSection("Investors")}>Explore the opportunity <Icon name="arrow" size={14} /></button></div>
          </section>
          <section className="community-note"><div className="note-icon">✳</div><div><strong>A country of many talents.</strong><p>From the coast to the highlands, there&apos;s room for every kind of talent to grow.</p><button onClick={() => setSection("My Network")}>Meet your community <span>→</span></button></div></section>
          <div className="right-footer"><span>Kenya <span className="kenya-dots"><i /><i /><i /></span></span><span>Built for every talent.</span></div>
        </aside>
      </div>

      {profileOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
        <form className="modal-card" onSubmit={(event) => void submitProfile(event)}>
          <div className="modal-heading"><div><p className="eyebrow">YOUR TALENT, YOUR STORY</p><h2>Edit your profile</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setProfileOpen(false)}><Icon name="close" /></button></div>
          <p className="modal-description">{supabase ? "Your profile is visible to the TalantaLink community." : "This demo profile is stored only for this browser session."}</p>
          <label>Your name<input name="displayName" required maxLength={100} defaultValue={profile?.display_name ?? "Alex Ouma"} /></label>
          <label>Headline<input name="headline" maxLength={160} placeholder="e.g. Dancer & choreographer" defaultValue={profile?.headline ?? "Dancer & choreographer"} /></label>
          <label>County<select name="county" defaultValue={profile?.countyId ? countyIds[profile.countyId - 1] : "Nairobi"}><option value="">Select a county</option>{counties.map((name) => <option key={name}>{name}</option>)}</select></label>
          <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setProfileOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save profile"} <Icon name="check" size={15} /></button></div>
        </form>
      </div>}

      {opportunityOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpportunityOpen(false); }}>
        <form className="modal-card" onSubmit={(event) => void submitOpportunity(event)}>
          <div className="modal-heading"><div><p className="eyebrow">CONNECT WITH KENYAN TALENT</p><h2>Post an opportunity</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setOpportunityOpen(false)}><Icon name="close" /></button></div>
          <p className="modal-description">Create a company listing and publish an opportunity for the community.</p>
          <label>Company or organisation<input name="companyName" required maxLength={160} placeholder="Organisation name" /></label>
          <label>Opportunity title<input name="title" required maxLength={160} placeholder="e.g. Event photographer" /></label>
          <label>Description<textarea name="description" required maxLength={5000} rows={4} placeholder="What will the talent do? Include any requirements." /></label>
          <div className="form-grid">
            <label>Type<select name="type" defaultValue="job"><option value="job">Job / gig</option><option value="sponsorship">Sponsorship</option><option value="collaboration">Collaboration</option></select></label>
            <label>County<select name="county" defaultValue=""><option value="">Nationwide</option>{counties.map((name) => <option key={name}>{name}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label>Compensation<input name="compensation" maxLength={120} placeholder="e.g. KES 18,000" /></label>
            <label>Application deadline<input name="deadline" type="datetime-local" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setOpportunityOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Publishing..." : "Publish opportunity"} <Icon name="arrow" size={15} /></button></div>
        </form>
      </div>}

      {adOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdOpen(false); }}>
        <form className="modal-card" onSubmit={submitAd}>
          <div className="modal-heading"><div><p className="eyebrow">REACH YOUR COMMUNITY</p><h2>Create a campaign</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setAdOpen(false)}><Icon name="close" /></button></div>
          <p className="modal-description">Tell the right people about an opportunity, event or product. This demo won&apos;t publish or charge for a campaign.</p>
          <label>Campaign name<input required placeholder="e.g. Emerging artists open call" /></label>
          <label>Who would you like to reach?<select defaultValue=""><option value="" disabled>Choose a talent category</option><option>Performing arts</option><option>Sports & fitness</option><option>Creative arts</option><option>All talent communities</option></select></label>
          <label>County<select defaultValue="All counties"><option>All counties</option>{counties.map((name) => <option key={name}>{name}</option>)}</select></label>
          <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdOpen(false)}>Cancel</button><button type="submit" className="primary-button">Save draft <Icon name="arrow" size={15} /></button></div>
        </form>
      </div>}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={section === "Home" ? "mobile-active" : ""} onClick={() => setSection("Home")}><Icon name="home" size={20} /><span>Home</span></button>
        <button className={section === "My Network" ? "mobile-active" : ""} onClick={() => setSection("My Network")}><Icon name="users" size={20} /><span>Network</span></button>
        <button className="mobile-post-button" onClick={() => { setSection("Home"); setPostOpen(true); }}><Icon name="plus" size={21} /><span>Post</span></button>
        <button className={section === "Jobs" ? "mobile-active" : ""} onClick={() => setSection("Jobs")}><Icon name="briefcase" size={20} /><span>Jobs</span></button>
        <button onClick={() => setProfileOpen(true)}><Avatar initials={profile ? getInitials(profile.display_name) : "AO"} tone="orange" size="small" /><span>Profile</span></button>
      </nav>
    </main>
  );
}
