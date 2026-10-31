"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/storage/signed-urls";

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
  | "map"
  | "arrow"
  | "clock"
  | "filter"
  | "check"
  | "send"
  | "close"
  | "external";

type Section = "Home" | "My Network" | "Jobs" | "Messages" | "Investors" | "Campaigns" | "Saved posts";
type OpportunityType = "Job" | "Sponsorship" | "Collaboration";

type Profile = {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  role: "talent" | "employer" | "recruiter" | "administrator";
  onboardingComplete: boolean;
  countyId: number | null;
  countyName: string;
  avatarUrl: string | null;
};

type Person = {
  id: string;
  name: string;
  role: string;
  county: string;
  talent: string;
  initials: string;
  tone: string;
  avatarUrl?: string | null;
};

type Opportunity = {
  id: string;
  company: string;
  title: string;
  detail: string;
  type: OpportunityType;
  county: string;
  tag: string;
  initials: string;
  tone: string;
  verified: boolean;
  ownerId: string;
  pay?: string;
  deadline: string;
  deadlineAt?: string | null;
};

type FeedPost = {
  id: string;
  userId: string;
  name: string;
  role: string;
  initials: string;
  tone: string;
  createdAt: string;
  text: string;
  likes: number;
  comments: number;
  avatarUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  mediaPath?: string | null;
  mentionedUsers?: Array<{ id: string; name: string; handle: string }>;
};

type PostComment = {
  id: string;
  userId: string;
  name: string;
  initials: string;
  text: string;
  avatarUrl?: string | null;
};

type Conversation = {
  userId: string;
  name: string;
  headline: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};

type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
};

type Campaign = {
  id: string;
  companyId: string;
  company: string;
  title: string;
  status: "draft" | "active" | "paused" | "ended";
  budget: number | null;
  impressions: number;
  clicks: number;
};

type TalentOption = {
  id: string;
  name: string;
};

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase();
}

function formatRelativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, duration] of units) {
    if (elapsed >= duration) return formatter.format(-Math.floor(elapsed / duration), unit);
  }
  return "Just now";
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

const navItems: { label: Section; icon: IconName }[] = [
  { label: "Home", icon: "home" },
  { label: "My Network", icon: "users" },
  { label: "Jobs", icon: "briefcase" },
  { label: "Messages", icon: "message" },
  { label: "Investors", icon: "sparkles" },
  { label: "Campaigns", icon: "chart" },
  { label: "Saved posts", icon: "bookmark" },
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
  return <div className={`avatar avatar-${tone} avatar-${size}`}>{image ? <Image className="avatar-image" src={image} alt="" width={40} height={40} unoptimized /> : initials}</div>;
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
  const [networkFilter, setNetworkFilter] = useState<"everyone" | "connected" | "incoming">("everyone");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remotePeople, setRemotePeople] = useState<Person[] | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, string>>({});
  const [liked, setLiked] = useState<string[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [remoteOpportunities, setRemoteOpportunities] = useState<Opportunity[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [postOpen, setPostOpen] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dataError, setDataError] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const loadVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const visiblePeople = useMemo(() => remotePeople ?? [], [remotePeople]);
  const visibleOpportunities = useMemo(() => remoteOpportunities ?? [], [remoteOpportunities]);
  const connectionCount = Object.values(connectionStatus).filter((status) => status === "connected").length;
  const invitationCount = Object.values(connectionStatus).filter((status) => status === "incoming").length;
  const visibleUnreadNotificationCount = currentUserId ? unreadNotificationCount : 0;

  useEffect(() => {
    if (currentUserId && profile && !profile.onboardingComplete) router.replace("/onboarding");
  }, [currentUserId, profile, router]);

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
    const updateClock = () => setClockTick(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith("post-") || !posts.some((post) => `post-${post.id}` === targetId)) return;
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [posts]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const loadUserData = async (userId: string | null) => {
      const version = ++loadVersion.current;
      setPosts([]);
      setLiked([]);
      setSavedPostIds([]);
      setFollowedIds([]);
      setCommentsByPost({});
      setOpenComments(null);
      setRemotePeople([]);
      setRemoteOpportunities([]);
      setProfile(null);
      setCampaigns([]);
      setConversations([]);
      setActiveConversationId(null);
      setDirectMessages([]);
      setApplied([]);
      setLoadingData(true);
      setDataError("");
      try {
        const [countyResult, profileResult, connectionResult, postResult, opportunityResult, savedPostsResult, followResult, talentProfilesResult, talentOptionsResult] = await Promise.all([
          supabase.from("counties").select("id,name"),
          userId
            ? supabase.from("profiles").select("id,display_name,headline,bio,role,onboarding_complete,county_id,avatar_path,avatar_bucket").eq("id", userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          userId
            ? supabase.from("connections").select("requester_id,receiver_id,status").or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("posts").select("id,user_id,content,image_url,video_url,media_storage_path,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(30),
          supabase.from("opportunities").select("id,title,description,type,county_id,talent_id,compensation,deadline,companies(name,is_verified,owner_id),counties(name),talents(name)").eq("status", "published").order("created_at", { ascending: false }).limit(100),
          userId
            ? supabase.from("saved_posts").select("post_id").eq("user_id", userId)
            : Promise.resolve({ data: [], error: null }),
          userId
            ? supabase.from("talent_follows").select("followed_id").eq("follower_id", userId)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("talent_profiles").select("user_id,talents(name)"),
          supabase.from("talents").select("id,name").order("name"),
        ]);
        for (const result of [countyResult, profileResult, connectionResult, postResult, opportunityResult, savedPostsResult, followResult, talentProfilesResult, talentOptionsResult]) {
          if (result.error) throw result.error;
        }
        if (!active || version !== loadVersion.current) return;

        const countyNames = new Map((countyResult.data ?? []).map((entry) => [entry.id, entry.name]));
        setTalentOptions(talentOptionsResult.data ?? []);
        if (profileResult.data) {
          const ownAvatarUrl = (await signAvatarUrls(supabase, [profileResult.data])).get(profileResult.data.id) ?? null;
          setProfile({
            id: profileResult.data.id,
            display_name: profileResult.data.display_name,
            headline: profileResult.data.headline,
            bio: profileResult.data.bio,
            role: profileResult.data.role,
            onboardingComplete: profileResult.data.onboarding_complete,
            countyId: profileResult.data.county_id,
            countyName: profileResult.data.county_id ? countyNames.get(profileResult.data.county_id) ?? "Kenya" : "Kenya",
            avatarUrl: ownAvatarUrl,
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
        setSavedPostIds((savedPostsResult.data ?? []).map((entry) => entry.post_id));
        setFollowedIds((followResult.data ?? []).map((entry) => entry.followed_id));

        const feedRows = postResult.data ?? [];
        if (feedRows.length) {
          const postIds = feedRows.map((post) => post.id);
          const userIds = [...new Set(feedRows.map((post) => post.user_id))];
          const [profilesResult, likesResult, commentsResult, mentionsResult] = await Promise.all([
            supabase.from("profiles").select("id,display_name,headline,county_id,avatar_path,avatar_bucket").in("id", userIds),
            supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
            supabase.from("comments").select("post_id").in("post_id", postIds),
            supabase.from("post_mentions").select("post_id,mentioned_user_id").in("post_id", postIds),
          ]);
          for (const result of [profilesResult, likesResult, commentsResult, mentionsResult]) {
            if (result.error) throw result.error;
          }
          const mentionedIds = [...new Set((mentionsResult.data ?? []).map((mention) => mention.mentioned_user_id))];
          const { data: mentionedProfiles, error: mentionedProfilesError } = mentionedIds.length
            ? await supabase.from("profiles").select("id,display_name").in("id", mentionedIds)
            : { data: [], error: null };
          if (mentionedProfilesError) throw mentionedProfilesError;
          if (!active || version !== loadVersion.current) return;
          const profileAvatarUrls = await signAvatarUrls(supabase, profilesResult.data ?? []);
          const profileById = new Map((profilesResult.data ?? []).map((entry) => [entry.id, entry]));
          const mentionedById = new Map((mentionedProfiles ?? []).map((entry) => [entry.id, entry.display_name]));
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
              userId: post.user_id,
              name: displayName,
              role: [author?.headline, author?.county_id ? countyNames.get(author.county_id) : null].filter(Boolean).join(" · ") || "TalantaLink community",
              initials: getInitials(displayName),
              tone: "green",
              createdAt: post.created_at,
              text: post.content,
              likes: likeCounts.get(post.id) ?? 0,
              comments: commentCounts.get(post.id) ?? 0,
              avatarUrl: author ? profileAvatarUrls.get(author.id) ?? null : null,
              imageUrl: post.image_url,
              videoUrl: post.video_url,
              mediaPath: post.media_storage_path,
              mentionedUsers: (mentionsResult.data ?? [])
                .filter((mention) => mention.post_id === post.id && mentionedById.has(mention.mentioned_user_id))
                .map((mention) => {
                  const name = mentionedById.get(mention.mentioned_user_id)!;
                  return { id: mention.mentioned_user_id, name, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
                }),
            };
          }));
        } else {
          setPosts([]);
          setLiked([]);
        }

        const talentNames = new Map<string, string[]>();
        for (const entry of talentProfilesResult.data ?? []) {
          const talent = Array.isArray(entry.talents) ? entry.talents[0] : entry.talents;
          if (talent?.name) talentNames.set(entry.user_id, [...(talentNames.get(entry.user_id) ?? []), talent.name]);
        }
        const peopleQuery = supabase.from("profiles").select("id,display_name,headline,county_id,avatar_path,avatar_bucket");
        const peopleResult = await (userId ? peopleQuery.neq("id", userId) : peopleQuery).limit(30);
        if (peopleResult.error) throw peopleResult.error;
        if (!active || version !== loadVersion.current) return;
        const peopleAvatarUrls = await signAvatarUrls(supabase, peopleResult.data ?? []);
        setRemotePeople((peopleResult.data ?? []).map((entry, index) => ({
          id: entry.id,
          name: entry.display_name,
          role: entry.headline || talentNames.get(entry.id)?.join(", ") || "TalantaLink member",
          county: entry.county_id ? countyNames.get(entry.county_id) ?? "Kenya" : "Kenya",
          talent: talentNames.get(entry.id)?.join(", ") || entry.headline || "",
          initials: getInitials(entry.display_name),
          tone: ["green", "rose", "blue", "gold", "violet", "orange"][index % 6],
          avatarUrl: peopleAvatarUrls.get(entry.id) ?? null,
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
            verified: company?.is_verified ?? false,
            ownerId: company?.owner_id ?? "",
            pay: entry.compensation ?? undefined,
            deadline: entry.deadline ? `Closes ${new Date(entry.deadline).toLocaleDateString()}` : "Open",
            deadlineAt: entry.deadline,
          };
        });
        setRemoteOpportunities(mappedOpportunities);
        if (userId) {
          const { data: applicationRows, error: applicationError } = await supabase
            .from("applications").select("opportunity_id").eq("applicant_id", userId);
          if (applicationError) throw applicationError;
          if (active && version === loadVersion.current) setApplied((applicationRows ?? []).map((application) => application.opportunity_id));
        } else {
          setApplied([]);
        }
        if (userId) {
          const { data: companyRows, error: companyError } = await supabase
            .from("companies").select("id,name").eq("owner_id", userId);
          if (companyError) throw companyError;
          if (companyRows?.length) {
            const companyById = new Map(companyRows.map((company) => [company.id, company.name]));
            const { data: campaignRows, error: campaignError } = await supabase
              .from("advertisements")
              .select("id,company_id,title,status,budget")
              .in("company_id", companyRows.map((company) => company.id))
              .order("created_at", { ascending: false });
            if (campaignError) throw campaignError;
            const campaignIds = (campaignRows ?? []).map((campaign) => campaign.id);
            const { data: eventRows, error: eventsError } = campaignIds.length
              ? await supabase.from("advertisement_events").select("advertisement_id,event_type").in("advertisement_id", campaignIds)
              : { data: [], error: null };
            if (eventsError) throw eventsError;
            const counts = new Map<string, { impressions: number; clicks: number }>();
            for (const event of eventRows ?? []) {
              const tally = counts.get(event.advertisement_id) ?? { impressions: 0, clicks: 0 };
              if (event.event_type === "impression") tally.impressions += 1;
              if (event.event_type === "click") tally.clicks += 1;
              counts.set(event.advertisement_id, tally);
            }
            if (active && version === loadVersion.current) setCampaigns((campaignRows ?? []).map((campaign) => ({
              id: campaign.id,
              companyId: campaign.company_id,
              company: companyById.get(campaign.company_id) ?? "Organisation",
              title: campaign.title,
              status: campaign.status,
              budget: campaign.budget,
              ...(counts.get(campaign.id) ?? { impressions: 0, clicks: 0 }),
            })));
          } else {
            setCampaigns([]);
          }
        } else {
          setCampaigns([]);
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

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;
    const refreshPost = async (postId: string) => {
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id,user_id,content,image_url,video_url,media_storage_path,created_at")
        .eq("id", postId)
        .eq("is_published", true)
        .maybeSingle();
      if (postError) {
        if (active) setDataError(postError.message);
        return;
      }
      if (!post) {
        if (active) {
          setPosts((current) => current.filter((entry) => entry.id !== postId));
          setCommentsByPost((current) => {
            const next = { ...current };
            delete next[postId];
            return next;
          });
        }
        return;
      }

      const [authorResult, likesResult, commentsResult, mentionsResult] = await Promise.all([
        supabase.from("profiles").select("id,display_name,headline,avatar_path,avatar_bucket,county_id").eq("id", post.user_id).maybeSingle(),
        supabase.from("post_likes").select("user_id", { count: "exact" }).eq("post_id", postId),
        supabase.from("comments").select("id,user_id,content").eq("post_id", postId).order("created_at", { ascending: true }),
        supabase.from("post_mentions").select("mentioned_user_id").eq("post_id", postId),
      ]);
      for (const result of [authorResult, likesResult, commentsResult, mentionsResult]) {
        if (result.error) {
          if (active) setDataError(result.error.message);
          return;
        }
      }
      if (!active) return;

      const author = authorResult.data;
      const authorName = author?.display_name ?? "TalantaLink member";
      const commentRows = commentsResult.data ?? [];
      const mentionedIds = [...new Set((mentionsResult.data ?? []).map((mention) => mention.mentioned_user_id))];
      const authorIds = [...new Set([post.user_id, ...commentRows.map((comment) => comment.user_id), ...mentionedIds])];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_path,avatar_bucket")
        .in("id", authorIds);
      if (profilesError) {
        if (active) setDataError(profilesError.message);
        return;
      }
      if (!active) return;
      const profileAvatarUrls = await signAvatarUrls(supabase, profiles ?? []);
      const names = new Map((profiles ?? []).map((entry) => [entry.id, entry.display_name]));
      const countyName = author?.county_id ? countyIds[author.county_id - 1] : undefined;
      const updatedPost: FeedPost = {
        id: post.id,
        userId: post.user_id,
        name: authorName,
        role: [author?.headline, countyName].filter(Boolean).join(" · ") || "TalantaLink community",
        initials: getInitials(authorName),
        tone: "green",
        createdAt: post.created_at,
        text: post.content,
        likes: likesResult.count ?? 0,
        comments: commentRows.length,
        avatarUrl: author ? profileAvatarUrls.get(author.id) ?? null : null,
        imageUrl: post.image_url,
        videoUrl: post.video_url,
        mediaPath: post.media_storage_path,
        mentionedUsers: (mentionsResult.data ?? []).flatMap((mention) => {
          const name = names.get(mention.mentioned_user_id);
          return name ? [{ id: mention.mentioned_user_id, name, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "") }] : [];
        }),
      };
      setPosts((current) => [updatedPost, ...current.filter((entry) => entry.id !== postId)]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 30));
      setCommentsByPost((current) => ({
        ...current,
        [postId]: commentRows.map((comment) => {
          const name = names.get(comment.user_id) ?? "TalantaLink member";
          return { id: comment.id, userId: comment.user_id, name, initials: getInitials(name), text: comment.content, avatarUrl: profileAvatarUrls.get(comment.user_id) ?? null };
        }),
      }));
      setDataError("");
    };

    const channel = supabase
      .channel("talantalink-community-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, (payload) => {
        const newId = "id" in payload.new ? payload.new.id : null;
        const oldId = "id" in payload.old ? payload.old.id : null;
        const postId = String(newId ?? oldId ?? "");
        if (postId) void refreshPost(postId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, (payload) => {
        const newPostId = "post_id" in payload.new ? payload.new.post_id : null;
        const oldPostId = "post_id" in payload.old ? payload.old.post_id : null;
        const postId = String(newPostId ?? oldPostId ?? "");
        if (postId) void refreshPost(postId);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        const postId = String(payload.new.post_id ?? "");
        if (postId) void refreshPost(postId);
      })
      .subscribe((status) => {
        if (!active) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setDataError("Live feed updates are unavailable. Apply the Supabase Realtime migration and try again.");
        }
      });

    return () => {
      active = false;
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !currentUserId) return;

    let active = true;
    const refreshUnreadCount = async () => {
      const { count, error } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", currentUserId)
        .is("read_at", null);
      if (!active) return;
      if (error) {
        setDataError(`Could not load unread notifications: ${error.message}`);
        return;
      }
      setUnreadNotificationCount(count ?? 0);
    };

    void refreshUnreadCount();
    const channel = supabase
      .channel(`talantalink-notification-count-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        () => void refreshUnreadCount(),
      )
      .subscribe((status) => {
        if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setDataError("Live notification counts are unavailable. Check the Supabase Realtime setup.");
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  const filteredPeople = useMemo(() => visiblePeople.filter((person) => {
    const matchesCounty = county === "All counties" || person.county === county;
    const matchesQuery = `${person.name} ${person.role} ${person.talent} ${person.county}`.toLowerCase().includes(query.toLowerCase());
    const status = connectionStatus[person.id ?? person.name];
    const matchesNetwork = networkFilter === "everyone"
      || (networkFilter === "connected" && status === "connected")
      || (networkFilter === "incoming" && status === "incoming");
    return matchesCounty && matchesQuery && matchesNetwork;
  }), [connectionStatus, county, networkFilter, query, visiblePeople]);

  const filteredOpportunities = useMemo(() => visibleOpportunities.filter((item) => {
    const matchesType = opportunityType === "All types" || item.type === opportunityType;
    const matchesCounty = county === "All counties" || item.county === county || item.county === "Nationwide";
    const matchesQuery = `${item.company} ${item.title} ${item.detail} ${item.tag} ${item.county}`.toLowerCase().includes(query.toLowerCase());
    const deadlineOpen = !item.deadlineAt || Date.parse(item.deadlineAt) > clockTick;
    return matchesType && matchesCounty && matchesQuery && deadlineOpen;
  }), [clockTick, county, opportunityType, query, visibleOpportunities]);
  const visiblePosts = useMemo(() => {
    const savedOnly = section === "Saved posts";
    return posts.filter((post) => {
      const matchesSaved = !savedOnly || savedPostIds.includes(post.id);
      const matchesQuery = `${post.name} ${post.role} ${post.text}`.toLowerCase().includes(query.toLowerCase());
      return matchesSaved && matchesQuery;
    });
  }, [posts, query, savedPostIds, section]);

  const loadConversations = useCallback(async (active = true) => {
    if (!supabase || !currentUserId) return;
    const { data: rows, error } = await supabase.from("messages")
      .select("id,sender_id,recipient_id,content,read_at,created_at")
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      if (active) setDataError(error.message);
      return;
    }
    if (!active) return;
    const participantIds = [...new Set((rows ?? []).map((row) => row.sender_id === currentUserId ? row.recipient_id : row.sender_id))];
    if (!participantIds.length) {
      setConversations([]);
      return;
    }
    const { data: members, error: membersError } = await supabase.from("profiles")
      .select("id,display_name,headline,avatar_path,avatar_bucket")
      .in("id", participantIds);
    if (membersError) {
      if (active) setDataError(membersError.message);
      return;
    }
    if (!active) return;
    const memberAvatarUrls = await signAvatarUrls(supabase, members ?? []);
    const membersById = new Map((members ?? []).map((member) => [member.id, member]));
    const conversationsById = new Map<string, Conversation>();
    for (const row of rows ?? []) {
      const userId = row.sender_id === currentUserId ? row.recipient_id : row.sender_id;
      const member = membersById.get(userId);
      if (!member) continue;
      const conversation = conversationsById.get(userId) ?? {
        userId,
        name: member.display_name,
        headline: member.headline || "TalantaLink member",
        avatarUrl: memberAvatarUrls.get(member.id) ?? null,
        lastMessage: row.content,
        lastMessageAt: row.created_at,
        unread: 0,
      };
      if (row.recipient_id === currentUserId && !row.read_at) conversation.unread += 1;
      conversationsById.set(userId, conversation);
    }
    const nextConversations = [...conversationsById.values()];
    setConversations(nextConversations);
    setActiveConversationId((current) => current && nextConversations.some((item) => item.userId === current)
      ? current
      : nextConversations[0]?.userId ?? null);
    setDataError("");
  }, [currentUserId, supabase]);

  const loadDirectMessages = useCallback(async (userId: string, active = true) => {
    if (!supabase || !currentUserId) return;
    setLoadingMessages(true);
    const { data: rows, error } = await supabase.from("messages")
      .select("id,sender_id,recipient_id,content,read_at,created_at")
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUserId})`)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      if (active) setDataError(error.message);
      if (active) setLoadingMessages(false);
      return;
    }
    if (!active) return;
    setDirectMessages((rows ?? []).map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      content: row.content,
      createdAt: row.created_at,
    })));
    const unreadIds = (rows ?? []).filter((row) => row.recipient_id === currentUserId && !row.read_at).map((row) => row.id);
    if (unreadIds.length) {
      const { error: readError } = await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
      if (readError) setDataError(readError.message);
      else void loadConversations(active);
    }
    setLoadingMessages(false);
  }, [currentUserId, loadConversations, supabase]);

  useEffect(() => {
    if (!supabase || !currentUserId) return;

    let active = true;
    const refresh = async () => {
      await loadConversations(active);
      if (active && activeConversationId) await loadDirectMessages(activeConversationId, active);
    };
    void refresh();

    const channel = supabase
      .channel(`talantalink-messages-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setDataError("Live message updates are unavailable. Apply the latest Supabase migration.");
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, activeConversationId, loadConversations, loadDirectMessages]);

  async function toggleSavedPost(postId: string) {
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    const isSaved = savedPostIds.includes(postId);
    setBusy(true);
    try {
      const result = isSaved
        ? await supabase.from("saved_posts").delete().eq("user_id", currentUserId).eq("post_id", postId)
        : await supabase.from("saved_posts").insert({ user_id: currentUserId, post_id: postId });
      if (result.error) throw result.error;
      setSavedPostIds((current) => isSaved ? current.filter((id) => id !== postId) : [...current, postId]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update saved posts.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow(person: Person) {
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    if (!person.id || person.id === currentUserId) return;
    const alreadyFollowing = followedIds.includes(person.id);
    setBusy(true);
    try {
      const result = alreadyFollowing
        ? await supabase.from("talent_follows").delete().eq("follower_id", currentUserId).eq("followed_id", person.id)
        : await supabase.from("talent_follows").insert({ follower_id: currentUserId, followed_id: person.id });
      if (result.error) throw result.error;
      setFollowedIds((current) => alreadyFollowing ? current.filter((id) => id !== person.id) : [...current, person.id]);
      setFeedback(alreadyFollowing ? `You unfollowed ${person.name}.` : `You are now following ${person.name}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update this follow.");
    } finally {
      setBusy(false);
    }
  }

  async function reportContent(targetType: "post" | "comment" | "profile", targetId: string) {
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    const reason = window.prompt(`Why are you reporting this ${targetType}?`);
    if (reason === null) return;
    if (!reason.trim()) {
      setFeedback("Add a reason before submitting a report.");
      return;
    }
    const { error } = await supabase.from("content_reports").insert({
      reporter_id: currentUserId,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim().slice(0, 1000),
    });
    if (error) {
      setFeedback(error.code === "23505" ? "You have already reported this content." : `Could not submit report: ${error.message}`);
      return;
    }
    setFeedback("Thank you. Your report was sent to the moderation team.");
  }

  async function sharePost(post: FeedPost) {
    const url = `${window.location.origin}/posts/${encodeURIComponent(post.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `TalantaLink post by ${post.name}`, text: post.text, url });
      else {
        await navigator.clipboard.writeText(url);
        setFeedback("Post link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback(error instanceof Error ? error.message : "Could not share this post.");
    }
  }

  async function removePost(post: FeedPost) {
    if (!supabase || !currentUserId || post.userId !== currentUserId) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    try {
      const { data: deletedPost, error } = await supabase.from("posts")
        .delete().eq("id", post.id).eq("user_id", currentUserId).select("media_storage_path").maybeSingle();
      if (error) throw error;
      setPosts((current) => current.filter((entry) => entry.id !== post.id));
      setSavedPostIds((current) => current.filter((id) => id !== post.id));
      const mediaPath = deletedPost?.media_storage_path ?? post.mediaPath;
      if (mediaPath) {
        const { error: storageError } = await supabase.storage.from("talantalink-posts").remove([mediaPath]);
        if (storageError) setFeedback(`Your post was deleted, but its media file could not be removed: ${storageError.message}`);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not delete the post.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = messageDraft.trim();
    if (!content || !activeConversationId) return;
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("messages").insert({
        sender_id: currentUserId,
        recipient_id: activeConversationId,
        content,
      });
      if (error) throw error;
      setMessageDraft("");
      await Promise.all([loadConversations(), loadDirectMessages(activeConversationId)]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not send this message.");
    } finally {
      setBusy(false);
    }
  }

  async function respondToConnection(person: Person, status: "accepted" | "rejected") {
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("connections").update({ status })
        .eq("requester_id", person.id).eq("receiver_id", currentUserId).eq("status", "pending");
      if (error) throw error;
      setConnectionStatus((current) => ({ ...current, [person.id]: status === "accepted" ? "connected" : "declined" }));
      if (status === "accepted") setFeedback(`You’re now connected with ${person.name}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not respond to this request.");
    } finally {
      setBusy(false);
    }
  }

  function openConversation(person: Person) {
    if (connectionStatus[person.id] !== "connected") return;
    setActiveConversationId(person.id);
    setSection("Messages");
  }

  async function toggleConnection(person: Person) {
    if (!supabase) {
      setFeedback("Connect Supabase to send and manage real connection requests.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    if (profile?.role !== "talent") {
      setFeedback("Only talent accounts can submit applications.");
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
        await respondToConnection(person, "accepted");
        return;
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

  function choosePostImage(file?: File) {
    if (!file) return;
    const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    const videoTypes = ["video/mp4", "video/webm"];
    if (![...imageTypes, ...videoTypes].includes(file.type)) {
      setFeedback("Choose a JPEG, PNG, WebP, AVIF, MP4 or WebM file.");
      return;
    }
    const maxSize = videoTypes.includes(file.type) ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setFeedback(videoTypes.includes(file.type) ? "Choose a video smaller than 50 MB." : "Choose an image smaller than 5 MB.");
      return;
    }
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostImage(file);
    setPostImagePreview(URL.createObjectURL(file));
    setPostOpen(true);
    setFeedback("");
  }

  function clearPostImage() {
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostImage(null);
    setPostImagePreview(null);
    if (photoInput.current) photoInput.current.value = "";
  }

  function selectMention(person: Person) {
    const handle = person.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    setPostText((current) => current.replace(/(^|\s)@[a-z0-9._-]*$/i, `$1@${handle} `));
    setMentionedUserIds((current) => current.includes(person.id) ? current : [...current, person.id]);
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = postText.trim();
    if (!content) {
      setFeedback("Add a short caption before publishing your post.");
      return;
    }
    const activeMentionIds = mentionedUserIds.filter((id) => {
      const person = visiblePeople.find((entry) => entry.id === id);
      if (!person) return false;
      const handle = person.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return content.toLowerCase().includes(`@${handle}`);
    });
    if (!supabase) {
      setFeedback("Connect Supabase to publish community updates.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    if (currentUserId) {
      setBusy(true);
      setFeedback("");
      let uploadedPath: string | null = null;
      try {
        let imageUrl: string | null = null;
        let videoUrl: string | null = null;
        if (postImage) {
          const extensionByType: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/avif": "avif",
            "video/mp4": "mp4",
            "video/webm": "webm",
          };
          const extension = extensionByType[postImage.type];
          if (!extension) throw new Error("Choose a supported photo or video.");
          uploadedPath = `${currentUserId}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("talantalink-posts")
            .upload(uploadedPath, postImage, { contentType: postImage.type, cacheControl: "3600" });
          if (uploadError) throw uploadError;
          const mediaUrl = supabase.storage.from("talantalink-posts").getPublicUrl(uploadedPath).data.publicUrl;
          if (postImage.type.startsWith("video/")) videoUrl = mediaUrl;
          else imageUrl = mediaUrl;
        }
        const hashtags = [...new Set(content.match(/#[\p{L}\p{N}_]+/gu)?.map((tag) => tag.slice(1).toLowerCase()) ?? [])];
        const { data: createdPost, error } = await supabase.from("posts")
          .insert({ user_id: currentUserId, content, image_url: imageUrl, video_url: videoUrl, media_storage_path: uploadedPath, hashtag_terms: hashtags }).select("id,created_at").single();
        if (error) throw error;
        if (activeMentionIds.length) {
          const { error: mentionError } = await supabase.from("post_mentions").insert(
            [...new Set(activeMentionIds)].map((mentionedUserId) => ({ post_id: createdPost.id, mentioned_user_id: mentionedUserId })),
          );
          if (mentionError) setFeedback(`Your post was published, but mentions could not be saved: ${mentionError.message}`);
        }
        const displayName = profile?.display_name ?? "You";
        setPosts((current) => [{
          id: createdPost.id,
          userId: currentUserId,
          name: displayName,
          role: [profile?.headline, profile?.countyName].filter(Boolean).join(" · ") || "TalantaLink community",
          initials: getInitials(displayName),
          tone: "green",
          createdAt: createdPost.created_at,
          text: content,
          likes: 0,
          comments: 0,
          avatarUrl: profile?.avatarUrl,
          imageUrl,
          videoUrl,
          mediaPath: uploadedPath,
          mentionedUsers: activeMentionIds.flatMap((id) => {
            const person = visiblePeople.find((entry) => entry.id === id);
            return person ? [{ id, name: person.name, handle: person.name.toLowerCase().replace(/[^a-z0-9]+/g, "") }] : [];
          }),
        }, ...current]);
        uploadedPath = null;
        if (!activeMentionIds.length) setFeedback("Your post was published.");
      } catch (error) {
        let message = error instanceof Error ? error.message : "Could not publish your post.";
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage.from("talantalink-posts").remove([uploadedPath]);
          if (cleanupError) message += ` The uploaded photo could not be removed: ${cleanupError.message}`;
        }
        setFeedback(message);
        setBusy(false);
        return;
      }
      setPostText("");
      setMentionedUserIds([]);
      clearPostImage();
      setPostOpen(false);
      setBusy(false);
      return;
    }
  }

  async function toggleLike(postId: string) {
    if (!supabase) {
      setFeedback("Connect Supabase to appreciate community posts.");
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

  async function showComments(postId: string) {
    setOpenComments((current) => current === postId ? null : postId);
    setCommentDraft("");
    if (!supabase || commentsByPost[postId]) return;
    try {
      const { data: commentRows, error } = await supabase.from("comments")
        .select("id,user_id,content").eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      const userIds = [...new Set((commentRows ?? []).map((comment) => comment.user_id))];
      const { data: authors, error: authorError } = userIds.length
        ? await supabase.from("profiles").select("id,display_name,avatar_path,avatar_bucket").in("id", userIds)
        : { data: [], error: null };
      if (authorError) throw authorError;
      const authorAvatarUrls = await signAvatarUrls(supabase, authors ?? []);
      const authorsById = new Map((authors ?? []).map((author) => [author.id, author]));
      setCommentsByPost((current) => ({
        ...current,
        [postId]: (commentRows ?? []).map((comment) => {
          const author = authorsById.get(comment.user_id);
          const name = author?.display_name ?? "TalantaLink member";
          return { id: comment.id, userId: comment.user_id, name, initials: getInitials(name), text: comment.content, avatarUrl: author ? authorAvatarUrls.get(author.id) ?? null : null };
        }),
      }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not load comments.");
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const content = commentDraft.trim();
    if (!content) return;
    if (!supabase) {
      setFeedback("Connect Supabase to comment on community posts.");
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
        [postId]: [...(current[postId] ?? []), { id: data.id, userId: currentUserId, name, initials: getInitials(name), text: content, avatarUrl: profile?.avatarUrl }],
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
    if (!["employer", "recruiter", "administrator"].includes(profile?.role ?? "")) {
      setFeedback("Only employer and recruiter accounts can publish opportunities.");
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
    if (deadlineValue && Date.parse(deadlineValue) <= Date.now()) {
      setFeedback("Choose an application deadline in the future.");
      return;
    }
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
        verified: false,
        ownerId: currentUserId,
        pay: compensation ?? undefined,
        deadline: deadlineValue ? `Closes ${new Date(deadlineValue).toLocaleDateString()}` : "Open",
        deadlineAt: deadlineValue ? new Date(deadlineValue).toISOString() : null,
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
    if (!supabase) {
      setFeedback("Connect Supabase to submit a real application.");
      return;
    }
    if (!currentUserId) {
      router.push("/auth");
      return;
    }
    if (item.ownerId === currentUserId) {
      setFeedback("You can’t apply to an opportunity published by your organisation.");
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

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const companyName = String(formData.get("companyName") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const talentId = String(formData.get("talentId") ?? "") || null;
    const countyName = String(formData.get("county") ?? "");
    const countyId = countyIdByName.get(countyName) ?? null;
    const budgetValue = String(formData.get("budget") ?? "").trim();
    const budget = budgetValue ? Number(budgetValue) : null;
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      setFeedback("Enter a valid non-negative campaign budget.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const { data: existingCompany, error: existingError } = await supabase.from("companies").select("id")
        .eq("owner_id", currentUserId).eq("name", companyName).maybeSingle();
      if (existingError) throw existingError;
      let companyId = existingCompany?.id;
      if (!companyId) {
        const { data: createdCompany, error: createCompanyError } = await supabase.from("companies")
          .insert({ owner_id: currentUserId, name: companyName })
          .select("id").single();
        if (createCompanyError) throw createCompanyError;
        companyId = createdCompany.id;
      }
      const { data: createdCampaign, error } = await supabase.from("advertisements")
        .insert({ company_id: companyId, title, target_talent_id: talentId, target_county_id: countyId, budget, status: "draft" })
        .select("id").single();
      if (error) throw error;
      setCampaigns((current) => [{
        id: createdCampaign.id,
        companyId,
        company: companyName,
        title,
        status: "draft",
        budget,
        impressions: 0,
        clicks: 0,
      }, ...current]);
      setFeedback("Campaign draft saved. It has not been published or delivered.");
      setCampaignOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save this campaign draft.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!supabase || !currentUserId) {
      router.push("/auth");
      return;
    }
    if (!window.confirm(`Delete the campaign draft “${campaign.title}”?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("advertisements").delete().eq("id", campaign.id).eq("company_id", campaign.companyId);
      if (error) throw error;
      setCampaigns((current) => current.filter((entry) => entry.id !== campaign.id));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not delete the campaign.");
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
    const mentionMatch = postText.match(/(?:^|\s)@([a-z0-9._-]*)$/i);
    const mentionSuggestions = mentionMatch
      ? visiblePeople
        .filter((person) => person.id !== currentUserId)
        .filter((person) => person.name.toLowerCase().replace(/[^a-z0-9]+/g, "").startsWith(mentionMatch[1].toLowerCase()))
        .slice(0, 5)
      : [];
    return (
      <>
        <form className={`composer card ${postOpen ? "composer-open" : ""}`} onSubmit={submitPost}>
          <div className="composer-top">
            <Avatar initials={profile ? getInitials(profile.display_name) : "TL"} tone="green" image={profile?.avatarUrl ?? undefined} />
            <button type="button" className="composer-prompt" onClick={() => setPostOpen((open) => !open)}>
              Share what you&apos;re working on with the community
            </button>
          </div>
          {postOpen && (
            <div className="post-compose-field">
              <textarea autoFocus value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="Tell us what you&apos;re creating, learning or looking for... Use #hashtags or @mentions." aria-label="Write a post" maxLength={5000} />
              {mentionSuggestions.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="People to mention">{mentionSuggestions.map((person) => <button type="button" key={person.id} onClick={() => selectMention(person)}><Avatar initials={person.initials} tone={person.tone} size="small" image={person.avatarUrl ?? undefined} /><span><strong>{person.name}</strong><small>@{person.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}</small></span></button>)}</div>}
            </div>
          )}
          {postImagePreview && <div className="post-photo-preview">
            {postImage?.type.startsWith("video/")
              ? <video src={postImagePreview} aria-label="Selected video preview" controls />
              : <Image src={postImagePreview} alt="Selected photo preview" width={1200} height={900} unoptimized />}
            <button type="button" className="icon-button" onClick={clearPostImage} aria-label="Remove selected photo"><Icon name="close" size={17} /></button>
          </div>}
          {postImagePreview && <p className="post-photo-note">{postImage?.type.startsWith("video/") ? "Videos are public with your post · Up to 50 MB" : "Photos are public with your post · Up to 5 MB"}</p>}
          <input
            ref={photoInput}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
            aria-label="Choose a photo or video"
            onChange={(event) => choosePostImage(event.target.files?.[0])}
          />
          <div className="composer-actions">
            <button type="button" className="quiet-button" disabled={!currentUserId} onClick={() => photoInput.current?.click()}><Icon name="image" size={17} /> Add photo or video</button>
            <button type="button" className="quiet-button" onClick={() => setSection("Jobs")}><Icon name="briefcase" size={17} /> Explore opportunities</button>
            {currentUserId
              ? postOpen
                ? <button className="primary-button compact" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish update"} <Icon name="arrow" size={15} /></button>
                : <button className="primary-button compact" type="button" onClick={() => setPostOpen(true)}>Write an update</button>
              : <Link className="primary-button compact" href="/auth">Sign in to post</Link>}
          </div>
        </form>

        <div className="feed-heading"><span>{section === "Saved posts" ? "Saved posts" : "Community updates"}</span><span className={`live-indicator ${realtimeConnected ? "is-live" : ""}`}><i />{realtimeConnected ? "Live updates" : configured ? "Connecting" : "Offline"}</span></div>
        {loadingData && <div className="empty-state card">Loading the community feed…</div>}
        {!loadingData && visiblePosts.length === 0 && <div className="empty-state card feed-empty-state">{section === "Saved posts" ? "You haven’t saved any posts yet." : configured ? "No community updates yet. Share the first one." : "Connect Supabase to view and share real community updates."}</div>}
        {visiblePosts.map((post) => {
          const isLiked = liked.includes(post.id);
          const isSaved = savedPostIds.includes(post.id);
          return (
            <article className="post card" id={`post-${post.id}`} key={post.id}>
              <div className="post-header">
                <Link href={`/talent/${post.userId}`} aria-label={`View ${post.name}'s profile`}><Avatar initials={post.initials} tone={post.tone} image={post.avatarUrl ?? undefined} /></Link>
                <div className="post-author"><Link href={`/talent/${post.userId}`}><strong>{post.name}</strong></Link><span>{post.role}</span><small><time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time> <span>·</span> <span className="public-dot">●</span></small></div>
              </div>
              <p className="post-copy">{post.text.split(/(#[\p{L}\p{N}_]+|@[a-z0-9._-]+)/giu).map((part, index) => {
                if (part.startsWith("#")) {
                  return <button className="post-hashtag" type="button" key={`${post.id}-${index}`} onClick={() => { setSection("Home"); setQuery(part); }}>{part}</button>;
                }
                if (part.startsWith("@")) {
                  const mentioned = post.mentionedUsers?.find((person) => `@${person.handle}`.toLowerCase() === part.toLowerCase());
                  return mentioned
                    ? <Link className="post-mention" href={`/talent/${mentioned.id}`} key={`${post.id}-${index}`}>{part}</Link>
                    : part;
                }
                return part;
              })}</p>
              {post.imageUrl && <Image className="post-media" src={post.imageUrl} alt={`Photo shared by ${post.name}`} width={1200} height={900} sizes="(max-width: 720px) 100vw, 720px" unoptimized />}
              {post.videoUrl && <video className="post-media" src={post.videoUrl} controls preload="metadata" aria-label={`Video shared by ${post.name}`} />}
              <div className="post-stats"><span>{post.likes} appreciations</span><span>{post.comments} comments</span></div>
              <div className="post-actions">
                <button className={isLiked ? "liked" : ""} disabled={busy} onClick={() => void toggleLike(post.id)}><Icon name="heart" size={17} /> {isLiked ? "Appreciated" : "Appreciate"}</button>
                <button onClick={() => void showComments(post.id)}><Icon name="comment" size={17} /> Comment</button>
                <button onClick={() => void sharePost(post)}><Icon name="share" size={17} /> Share</button>
                <button className={isSaved ? "liked" : ""} disabled={busy} onClick={() => void toggleSavedPost(post.id)} aria-label={isSaved ? "Remove saved post" : "Save post"}><Icon name="bookmark" size={17} /> {isSaved ? "Saved" : "Save"}</button>
                {currentUserId !== post.userId && <button className="post-delete-button" disabled={busy} onClick={() => void reportContent("post", post.id)} aria-label="Report post">Report</button>}
                {currentUserId === post.userId && <button className="post-delete-button" disabled={busy} onClick={() => void removePost(post)} aria-label="Delete your post"><Icon name="close" size={17} /> Delete</button>}
              </div>
              {openComments === post.id && <div className="comments-panel">
                {(commentsByPost[String(post.id)] ?? []).map((comment) => <div className="comment-row" key={comment.id}><Avatar initials={comment.initials} tone="green" size="small" image={comment.avatarUrl ?? undefined} /><p><strong>{comment.name}</strong><span>{comment.text}</span></p>{currentUserId && comment.userId !== currentUserId && <button className="text-button" onClick={() => void reportContent("comment", comment.id)}>Report</button>}</div>)}
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
        <SectionTitle eyebrow="Meet real members" title="My Network" />
        <div className="network-summary card">
          <button className={networkFilter === "connected" ? "network-filter active" : "network-filter"} onClick={() => setNetworkFilter(networkFilter === "connected" ? "everyone" : "connected")}><span className="summary-number">{connectionCount}</span><span>connections</span></button>
          <button className={networkFilter === "incoming" ? "network-filter active" : "network-filter"} onClick={() => setNetworkFilter(networkFilter === "incoming" ? "everyone" : "incoming")}><span className="summary-number">{invitationCount}</span><span>connection requests</span></button>
          <p>Connect with people whose work and interests match yours.</p>
        </div>
        <div className="list-toolbar"><div><h2>{networkFilter === "incoming" ? "Connection requests" : networkFilter === "connected" ? "Your connections" : "Community members"}</h2><p>Find members by name, talent or county.</p></div>{countySelect}</div>
        <div className="people-grid">
          {loadingData && <div className="empty-state card">Loading community members…</div>}
          {filteredPeople.map((person) => {
            const status = connectionStatus[person.id ?? person.name];
            return (
            <article className="person-card card" key={person.id ?? person.name}>
              <div className={`person-cover cover-${person.tone}`}><span className="cover-star">✳</span></div>
              <Link href={`/talent/${person.id}`} aria-label={`View ${person.name}'s profile`}><Avatar initials={person.initials} tone={person.tone} size="large" image={person.avatarUrl ?? undefined} /></Link>
              <div className="person-info"><Link href={`/talent/${person.id}`}><strong>{person.name}</strong></Link><span>{person.role}</span><small><Icon name="map" size={13} /> {person.county === "Kenya" ? "Kenya" : `${person.county} County`}</small></div>
              {currentUserId && person.id && <button className="outline-button" disabled={busy} onClick={() => void toggleFollow(person)}>{followedIds.includes(person.id) ? "Following" : "Follow"}</button>}
              {status === "incoming"
                ? <div className="person-actions"><button className="connect-button" disabled={busy} onClick={() => void respondToConnection(person, "accepted")}><Icon name="check" size={16} /> Accept</button><button className="outline-button" disabled={busy} onClick={() => void respondToConnection(person, "rejected")}>Decline</button></div>
                : status === "connected"
                  ? <div className="person-actions"><button className="connect-button is-connected" disabled><Icon name="check" size={16} /> Connected</button><button className="outline-button" onClick={() => openConversation(person)}>Message</button></div>
                  : <button className="connect-button" disabled={busy || status === "declined"} onClick={() => void toggleConnection(person)}><Icon name={status === "pending" ? "close" : "plus"} size={16} /> {status === "pending" ? "Cancel request" : status === "declined" ? "Request declined" : "Connect"}</button>}
              {currentUserId && person.id !== currentUserId && <button className="text-button profile-report-button" disabled={busy} onClick={() => void reportContent("profile", person.id)}>Report profile</button>}
            </article>
          );})}
          {!loadingData && filteredPeople.length === 0 && <div className="empty-state card">{supabase ? "No members match these filters yet. Try another county or search." : "Connect Supabase and sign in to discover real community members."}</div>}
        </div>
      </>
    );
  }

  function renderOpportunities(title: "Jobs" | "Investors") {
    const isJobs = title === "Jobs";
    const list = isJobs ? filteredOpportunities.filter((item) => item.type === "Job") : filteredOpportunities;
    const canManageOpportunities = ["employer", "recruiter", "administrator"].includes(profile?.role ?? "");
    const sectionAction = (
      <div className="title-actions">
        {countySelect}
        {canManageOpportunities
          ? <button className="primary-button" onClick={() => setOpportunityOpen(true)}><Icon name="plus" size={16} /> Post an opportunity</button>
          : !currentUserId && <Link className="outline-button" href="/auth">Sign in to post an opportunity</Link>}
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
            <article className="opportunity-card card" key={item.id}>
              <div className={`company-mark mark-${item.tone}`}>{item.initials}</div>
              <div className="opportunity-content">
                <div className="opportunity-company">{item.company}{item.verified && <span className="verified-mark" aria-label="Verified organisation">✓</span>}</div>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <div className="opportunity-meta"><span><Icon name="map" size={14} /> {item.county}</span><span className="tag">{item.tag}</span><span className={`type-label type-${item.type.toLowerCase()}`}>{item.type}</span></div>
              </div>
              <div className="opportunity-apply">
                <strong>{item.pay ?? "Open opportunity"}</strong>
                <span><Icon name="clock" size={13} /> {item.deadline}</span>
                {profile?.role === "talent"
                  ? <button className={isApplied ? "outline-button applied" : "primary-button"} disabled={busy || item.ownerId === currentUserId} onClick={() => void toggleApply(item)}>
                    {isApplied ? <><Icon name="check" size={15} /> Withdraw application</> : item.ownerId === currentUserId ? "Your listing" : "Apply"}
                  </button>
                  : !currentUserId && <Link className="primary-button" href="/auth">Sign in to apply</Link>}
              </div>
            </article>
          );})}
          {list.length === 0 && <div className="empty-state card">{supabase ? "No published opportunities match these filters yet." : "Connect Supabase to browse real opportunities."}</div>}
        </div>
      </>
    );
  }

  function renderCampaigns() {
    const totalImpressions = campaigns.reduce((total, campaign) => total + campaign.impressions, 0);
    const totalClicks = campaigns.reduce((total, campaign) => total + campaign.clicks, 0);
    return (
      <>
        <SectionTitle eyebrow="For organisations" title="Campaigns" action={
          ["employer", "recruiter", "administrator"].includes(profile?.role ?? "")
            ? <button className="primary-button" onClick={() => setCampaignOpen(true)}><Icon name="plus" size={17} /> Create campaign draft</button>
            : !currentUserId && <Link className="primary-button" href="/auth">Sign in to manage campaigns</Link>
        } />
        <p className="page-intro">Manage campaign drafts for your organisation. Drafts are saved to your account and are not delivered as ads.</p>
        <div className="metrics-grid">
          <div className="metric-card card"><span>Campaign drafts</span><strong>{campaigns.length}</strong><small>Your organisation’s saved campaigns</small></div>
          <div className="metric-card card"><span>Recorded impressions</span><strong>{totalImpressions.toLocaleString()}</strong><small>Events recorded in the database</small></div>
          <div className="metric-card card"><span>Recorded clicks</span><strong>{totalClicks.toLocaleString()}</strong><small>Events recorded in the database</small></div>
          <div className="metric-card card"><span>Delivery</span><strong>Not enabled</strong><small>Campaign delivery is not configured</small></div>
        </div>
        <div className="card campaign-panel">
          <div className="panel-heading"><div><h2>Your campaign drafts</h2><p>Saved against your organisation.</p></div></div>
          {loadingData && <div className="empty-state">Loading your campaigns…</div>}
          {!loadingData && campaigns.map((campaign) => (
            <div className="campaign-row" key={campaign.id}>
              <span className="campaign-dot dot-green" />
              <div className="campaign-name"><strong>{campaign.title}</strong><span>{campaign.company} · {campaign.status}</span></div>
              <span className="campaign-stat"><strong>{campaign.budget === null ? "—" : `KES ${campaign.budget.toLocaleString()}`}</strong><small>Budget</small></span>
              <span className="campaign-stat"><strong>{campaign.impressions.toLocaleString()}</strong><small>Impressions</small></span>
              <span className="campaign-stat"><strong>{campaign.clicks.toLocaleString()}</strong><small>Clicks</small></span>
              <button className="icon-button" disabled={busy} onClick={() => void deleteCampaign(campaign)} aria-label={`Delete ${campaign.title}`}><Icon name="close" size={16} /></button>
            </div>
          ))}
          {!loadingData && campaigns.length === 0 && <div className="empty-state">{supabase ? "You don’t have any campaign drafts yet." : "Connect Supabase to manage real campaign drafts."}</div>}
        </div>
        <div className="notice-card"><Icon name="sparkles" size={18} /><p><strong>Campaign delivery is not enabled.</strong> No impressions, clicks or billing are generated by this platform yet.</p></div>
      </>
    );
  }

  function renderMessages() {
    const activeConversation = conversations.find((conversation) => conversation.userId === activeConversationId) ?? null;
    const filteredConversations = conversations.filter((conversation) => (
      `${conversation.name} ${conversation.headline}`.toLowerCase().includes(messageSearch.toLowerCase())
    ));
    return (
      <>
        <SectionTitle eyebrow="Private conversations" title="Messages" />
        {!currentUserId && <div className="empty-state card">Sign in to message people you’re connected with. <Link href="/auth">Sign in</Link></div>}
        {currentUserId && <p className="page-intro">Messages are private and available to members who have accepted each other’s connection request.</p>}
        <div className="messages-layout card">
          <div className="conversation-list">
            <label className="conversation-search"><Icon name="search" size={15} /><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
            {filteredConversations.map((conversation) => (
              <button className={`conversation ${conversation.userId === activeConversationId ? "conversation-active" : ""}`} key={conversation.userId} onClick={() => setActiveConversationId(conversation.userId)}>
                <Avatar initials={getInitials(conversation.name)} tone="green" image={conversation.avatarUrl ?? undefined} /><span className="conversation-copy"><strong>{conversation.name}</strong><small>{conversation.lastMessage}</small></span><time>{formatRelativeTime(conversation.lastMessageAt)}</time>{conversation.unread > 0 && <span className="unread-count">{conversation.unread}</span>}
              </button>
            ))}
            {filteredConversations.length === 0 && <div className="empty-state">{currentUserId ? "No conversations yet. Connect with a member to start a conversation." : "Your conversations will appear here after you sign in."}</div>}
          </div>
          <div className="chat-panel">
            {activeConversation ? <>
              <div className="chat-header"><Avatar initials={getInitials(activeConversation.name)} tone="green" size="small" image={activeConversation.avatarUrl ?? undefined} /><span><strong>{activeConversation.name}</strong><small>{activeConversation.headline}</small></span></div>
              <div className="chat-body" aria-live="polite">
                {loadingMessages && <p className="comment-hint">Loading messages…</p>}
                {!loadingMessages && directMessages.length === 0 && <p className="comment-hint">Start the conversation with {activeConversation.name}.</p>}
                {directMessages.map((message) => <div key={message.id} className={`message-bubble ${message.senderId === currentUserId ? "sent" : "received"}`}>{message.content}<time dateTime={message.createdAt}>{formatRelativeTime(message.createdAt)}</time></div>)}
              </div>
              <form className="chat-compose" onSubmit={(event) => void sendMessage(event)}><input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={5000} placeholder="Write a message…" aria-label="Write a message" disabled={busy} /><button type="submit" disabled={busy || !messageDraft.trim()} aria-label="Send message"><Icon name="send" size={17} /></button></form>
            </> : <div className="empty-state chat-empty">{currentUserId ? "Choose a conversation, or connect with a member to start one." : "Sign in to access your private messages."}</div>}
          </div>
        </div>
      </>
    );
  }

  const renderMain = () => {
    if (section === "My Network") return renderPeople();
    if (section === "Jobs") return renderOpportunities("Jobs");
    if (section === "Investors") return renderOpportunities("Investors");
    if (section === "Campaigns") return renderCampaigns();
    if (section === "Messages") return renderMessages();
    if (section === "Saved posts") return renderPosts();
    return (
      <>
        <div className="welcome-strip"><span className="welcome-kicker">KENYA’S TALENT COMMUNITY</span><h1>Good work deserves to be seen.</h1><p>Share what you&apos;re building, meet people who get it, and discover opportunities across Kenya.</p><div className="community-explore-links"><Link href="/discover">Discover talent <span>→</span></Link><Link href="/opportunities">Browse opportunities <span>→</span></Link><Link href="/inbox">Private inbox <span>→</span></Link></div></div>
        {renderPosts()}
      </>
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" onClick={() => setSection("Home")} aria-label="TalantaLink home">
          <span className="brand-shield"><Image src="/kenya-flag.svg" alt="" width={35} height={39} priority /></span>
          <span className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></span>
        </Link>
        <label className="global-search"><Icon name="search" size={17} /><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search talent, skills, opportunities..." aria-label="Search TalantaLink" /><kbd>Ctrl K</kbd></label>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.filter((item) => ["Home", "My Network", "Jobs", "Messages"].includes(item.label)).map((item) => (
            <button key={item.label} aria-label={item.label} title={item.label} className={section === item.label ? "desktop-nav-active" : ""} onClick={() => setSection(item.label)}>
              <Icon name={item.icon} size={19} />
              <span>{item.label === "My Network" ? "Network" : item.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-actions"><span className={`connection-badge ${realtimeConnected ? "is-live" : ""}`}><span /> {realtimeConnected ? "LIVE" : configured ? "CONNECTING" : "OFFLINE"}</span><Link className="icon-button notification-button" aria-label={`Notification centre${visibleUnreadNotificationCount ? `, ${visibleUnreadNotificationCount} unread` : ""}`} href="/notifications"><Icon name="bell" size={19} />{visibleUnreadNotificationCount > 0 && <span className="notification-count">{visibleUnreadNotificationCount > 99 ? "99+" : visibleUnreadNotificationCount}</span>}</Link><div className="topbar-divider" />{currentUserId && supabase ? <button className="profile-menu" onClick={() => void signOut()}><Avatar initials={profile ? getInitials(profile.display_name) : "TL"} tone="green" size="small" image={profile?.avatarUrl ?? undefined} /><span>{profile?.display_name ?? "Account"}</span><span className="chevron">↪</span></button> : <Link className="profile-menu" href="/auth"><Avatar initials="TL" tone="green" size="small" /><span>Sign in</span><span className="chevron">→</span></Link>}</div>
      </header>

      <div className="app-layout">
        <aside className="left-sidebar">
          <div className="sidebar-profile card">
            <div className="profile-cover"><span>✳</span><span>✳</span><span>✳</span></div>
            <Avatar initials={profile ? getInitials(profile.display_name) : "TL"} tone="green" size="large" image={profile?.avatarUrl ?? undefined} />
            <div className="sidebar-profile-info"><strong>{profile?.display_name ?? (currentUserId ? "Complete your profile" : "Welcome to TalantaLink")}</strong><span>{profile?.headline || (currentUserId ? "Add a headline to introduce yourself" : "A community for Kenya’s talent")}</span><small><Icon name="map" size={13} /> {profile?.countyName ?? "Across Kenya"}</small></div>
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
            <button className="profile-edit" onClick={() => currentUserId ? router.push("/profile/edit") : router.push("/auth")}>{currentUserId ? "Edit your profile" : "Join the community"} <Icon name="arrow" size={14} /></button>
          </div>
          <nav className="side-nav" aria-label="Main navigation">
            <p className="nav-label">YOUR SPACE</p>
            <Link className="nav-item" href="/discover"><Icon name="search" size={18} /><span>Discover talent</span></Link>
            <Link className="nav-item" href="/opportunities"><Icon name="briefcase" size={18} /><span>Opportunity marketplace</span></Link>
            <Link className="nav-item" href="/inbox"><Icon name="message" size={18} /><span>Private inbox</span></Link>
            {navItems.filter((item) => item.label === "Investors" || item.label === "Campaigns" || item.label === "Saved posts").map((item) => <button key={item.label} className={`nav-item ${section === item.label ? "nav-active" : ""}`} onClick={() => setSection(item.label)}><Icon name={item.icon} size={18} /><span>{item.label === "Investors" ? "Funding & partners" : item.label}</span></button>)}
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
            {visibleOpportunities.slice(0, 3).map((item) => <button className="mini-opportunity" key={item.id} onClick={() => { setSection(item.type === "Job" ? "Jobs" : "Investors"); setQuery(item.title); }}><span className={`company-mark mini-mark mark-${item.tone}`}>{item.initials}</span><span><strong>{item.title}</strong><small>{item.company} · {item.county}</small></span><Icon name="arrow" size={14} /></button>)}
            {visibleOpportunities.length === 0 && <p className="empty-sidebar-note">{loadingData ? "Loading opportunities…" : "No published opportunities yet."}</p>}
            <button className="view-all-link" onClick={() => { setQuery(""); setSection("Investors"); }}>Explore all opportunities <span>→</span></button>
          </section>
          <section className="community-note"><div className="note-icon">✳</div><div><strong>A country of many talents.</strong><p>From the coast to the highlands, there&apos;s room for every kind of talent to grow.</p><button onClick={() => setSection("My Network")}>Meet your community <span>→</span></button></div></section>
          <div className="right-footer"><span>Kenya <span className="kenya-dots"><i /><i /><i /></span></span><span>Built for every talent.</span></div>
        </aside>
      </div>

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

      {campaignOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCampaignOpen(false); }}>
        <form className="modal-card" onSubmit={(event) => void submitCampaign(event)}>
          <div className="modal-heading"><div><p className="eyebrow">ORGANISATION CAMPAIGN</p><h2>Save a campaign draft</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setCampaignOpen(false)}><Icon name="close" /></button></div>
          <p className="modal-description">Drafts are saved to your organisation. Campaign publishing and ad delivery are not currently available.</p>
          <label>Organisation<input name="companyName" required maxLength={160} placeholder="Registered organisation name" /></label>
          <label>Campaign title<input name="title" required maxLength={160} placeholder="What are you promoting?" /></label>
          <label>Talent audience<select name="talentId" defaultValue=""><option value="">All talent communities</option>{talentOptions.map((talent) => <option key={talent.id} value={talent.id}>{talent.name}</option>)}</select></label>
          <div className="form-grid">
            <label>County<select name="county" defaultValue=""><option value="">All counties</option>{counties.map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>Planned budget (KES)<input name="budget" type="number" min="0" step="1" placeholder="Optional" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setCampaignOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save draft"} <Icon name="arrow" size={15} /></button></div>
        </form>
      </div>}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={section === "Home" ? "mobile-active" : ""} onClick={() => setSection("Home")}><Icon name="home" size={20} /><span>Home</span></button>
        <button className={section === "My Network" ? "mobile-active" : ""} onClick={() => setSection("My Network")}><Icon name="users" size={20} /><span>Network</span></button>
        <button className="mobile-post-button" onClick={() => { setSection("Home"); setPostOpen(true); }}><Icon name="plus" size={21} /><span>Post</span></button>
        <button className={section === "Jobs" ? "mobile-active" : ""} onClick={() => setSection("Jobs")}><Icon name="briefcase" size={20} /><span>Jobs</span></button>
        <button className={section === "Messages" ? "mobile-active" : ""} onClick={() => setSection("Messages")}><Icon name="message" size={20} /><span>Messages</span></button>
        <button className={section === "Investors" ? "mobile-active" : ""} onClick={() => setSection("Investors")}><Icon name="sparkles" size={20} /><span>Funding</span></button>
        <button className={section === "Campaigns" ? "mobile-active" : ""} onClick={() => setSection("Campaigns")}><Icon name="chart" size={20} /><span>Campaigns</span></button>
        <button className={section === "Saved posts" ? "mobile-active" : ""} onClick={() => setSection("Saved posts")}><Icon name="bookmark" size={20} /><span>Saved</span></button>
        <button onClick={() => currentUserId ? router.push("/profile/edit") : router.push("/auth")}><Avatar initials={profile ? getInitials(profile.display_name) : "TL"} tone="green" size="small" image={profile?.avatarUrl ?? undefined} /><span>{profile ? "Profile" : "Sign in"}</span></button>
      </nav>
    </main>
  );
}
