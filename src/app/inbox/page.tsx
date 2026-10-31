import { Suspense } from "react";
import { requireCompletedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/signed-urls";
import InboxClient, {
  type InboxContact,
  type InboxMessage,
  type MessageAttachment,
} from "./inbox-client";
import styles from "./inbox.module.css";

export const metadata = {
  title: "Private messages",
  robots: { index: false, follow: false },
};

async function InboxContent() {
  const profile = await requireCompletedProfile();
  const supabase = await createSupabaseServerClient();

  const [messagesResult, connectionsResult, blocksResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,sender_id,recipient_id,content,created_at,read_at")
      .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("connections")
      .select("requester_id,receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${profile.id},receiver_id.eq.${profile.id}`),
    supabase
      .from("message_user_blocks")
      .select("blocked_id")
      .eq("blocker_id", profile.id),
  ]);

  if (messagesResult.error) throw new Error("Could not load your inbox.");
  if (connectionsResult.error) throw new Error("Could not load your connections.");
  if (blocksResult.error) throw new Error("Could not load your block list.");

  const messages = messagesResult.data ?? [];
  const connectedIds = new Set(
    (connectionsResult.data ?? []).map((connection) =>
      connection.requester_id === profile.id
        ? connection.receiver_id
        : connection.requester_id,
    ),
  );
  const peerIds = Array.from(
    new Set([
      ...connectedIds,
      ...messages.map((message) =>
        message.sender_id === profile.id ? message.recipient_id : message.sender_id,
      ),
    ]),
  );
  const attachmentsResult = messages.length
    ? await supabase
        .from("message_attachments")
        .select("message_id,storage_path,file_name,mime_type,file_size")
        .in("message_id", messages.map((message) => message.id))
    : { data: [], error: null };
  if (attachmentsResult.error) throw new Error("Could not load message attachments.");

  const profilesResult = peerIds.length
    ? await supabase
        .from("profiles")
          .select("id,display_name,avatar_path,avatar_bucket")
        .in("id", peerIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error("Could not load conversation profiles.");
  const avatarUrls = await signAvatarUrls(supabase, profilesResult.data ?? []);

  const blockedIds = new Set((blocksResult.data ?? []).map((block) => block.blocked_id));
  const blockChecks = await Promise.all(
    peerIds.map(async (peerId) => {
      const { data } = await supabase.rpc("is_message_user_blocked", {
        target_user_id: peerId,
      });
      return [peerId, Boolean(data)] as const;
    }),
  );
  const blockedByEitherMember = new Set(
    blockChecks.filter(([, blocked]) => blocked).map(([peerId]) => peerId),
  );

  const contacts: InboxContact[] = peerIds.map((id) => {
    const peer = profilesResult.data?.find((candidate) => candidate.id === id);
    return {
      id,
      displayName: peer?.display_name || "TalantaLink member",
      avatarUrl: peer ? avatarUrls.get(peer.id) ?? null : null,
      canMessage: connectedIds.has(id),
      blocked: blockedIds.has(id) || blockedByEitherMember.has(id),
      blockedByMe: blockedIds.has(id),
    };
  });
  const attachmentByMessage = new Map(
    ((attachmentsResult.data ?? []) as MessageAttachment[]).map((attachment) => [
      attachment.message_id,
      attachment,
    ]),
  );
  const initialMessages: InboxMessage[] = messages.map((message) => ({
    ...message,
    attachment: attachmentByMessage.get(message.id) ?? null,
  }));
  const { count: unreadCount, error: unreadError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (unreadError) throw new Error("Could not load your unread message count.");

  return (
    <InboxClient
      userId={profile.id}
      initialContacts={contacts}
      initialMessages={initialMessages}
      initialUnreadCount={unreadCount ?? 0}
    />
  );
}

export default function InboxPage() {
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>TALANTALINK MESSAGES</p>
        <h1>Your inbox</h1>
        <p>Private conversations with your professional connections.</p>
      </header>
      <Suspense fallback={<div className={styles.loading} aria-busy="true">Loading your inbox…</div>}>
        <InboxContent />
      </Suspense>
    </main>
  );
}
