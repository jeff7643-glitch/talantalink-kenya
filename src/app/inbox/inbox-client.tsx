"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./inbox.module.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedFileTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export type MessageAttachment = {
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
};

export type InboxMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  attachment: MessageAttachment | null;
};

export type InboxContact = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  canMessage: boolean;
  blocked: boolean;
  blockedByMe: boolean;
};

type InboxClientProps = {
  userId: string;
  initialContacts: InboxContact[];
  initialMessages: InboxMessage[];
  initialUnreadCount: number;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AttachmentLink({ attachment }: { attachment: MessageAttachment }) {
  const [signedUrl, setSignedUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAttachment() {
    if (signedUrl || loading) return;
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: signedUrlError } = await supabase.storage
      .from("talantalink-inbox-files")
      .createSignedUrl(attachment.storage_path, 60);
    setLoading(false);
    if (signedUrlError || !data?.signedUrl) {
      setError("This file is unavailable.");
      return;
    }
    setSignedUrl(data.signedUrl);
  }

  if (signedUrl && attachment.mime_type.startsWith("image/")) {
    return (
      <a className={styles.attachment} href={signedUrl} target="_blank" rel="noreferrer">
        <Image
          src={signedUrl}
          alt={attachment.file_name}
          width={360}
          height={240}
          unoptimized
          className={styles.attachmentImage}
        />
        <span>{attachment.file_name}</span>
      </a>
    );
  }

  if (signedUrl) {
    return (
      <a className={styles.attachmentLink} href={signedUrl} target="_blank" rel="noreferrer">
        {attachment.file_name} <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <span className={styles.attachmentControl}>
      <button type="button" className={styles.attachmentLink} onClick={loadAttachment} disabled={loading}>
        {loading ? "Preparing file…" : `Open ${attachment.file_name}`}
      </button>
      {error && <span className={styles.inlineError}>{error}</span>}
    </span>
  );
}

export default function InboxClient({
  userId,
  initialContacts,
  initialMessages,
  initialUnreadCount,
}: InboxClientProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [contacts, setContacts] = useState(initialContacts);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [liveNotice, setLiveNotice] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedContact = contacts.find((contact) => contact.id === selectedId) ?? null;
  const conversationMessages = messages
    .filter(
      (message) =>
        message.sender_id === selectedId || message.recipient_id === selectedId,
    )
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const refreshUnreadCount = useCallback(async () => {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (typeof count === "number") setUnreadCount(count);
  }, [supabase, userId]);

  const markConversationRead = useCallback(
    async (peerId: string) => {
      const { error: readError } = await supabase.rpc("mark_message_conversation_read", {
        target_user_id: peerId,
      });
      if (readError) return;
      const readAt = new Date().toISOString();
      setMessages((current) =>
        current.map((message) =>
          message.sender_id === peerId &&
          message.recipient_id === userId &&
          message.read_at === null
            ? { ...message, read_at: readAt }
            : message,
        ),
      );
      await refreshUnreadCount();
    },
    [refreshUnreadCount, supabase, userId],
  );

  useEffect(() => {
    async function addMessage(row: Omit<InboxMessage, "attachment">) {
      const { data: attachment } = await supabase
        .from("message_attachments")
        .select("message_id,storage_path,file_name,mime_type,file_size")
        .eq("message_id", row.id)
        .maybeSingle();
      const message: InboxMessage = {
        ...row,
        attachment: (attachment as MessageAttachment | null) ?? null,
      };

      setMessages((current) => {
        const found = current.some((existing) => existing.id === message.id);
        if (found) {
          return current.map((existing) =>
            existing.id === message.id ? { ...existing, ...message } : existing,
          );
        }
        return [message, ...current].slice(0, 500);
      });

      if (message.recipient_id === userId) {
        setLiveNotice("You have a new message.");
        if (message.sender_id === selectedId && !selectedContact?.blocked) {
          void markConversationRead(message.sender_id);
        } else {
          setUnreadCount((count) => count + 1);
        }
      }
    }

    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => void addMessage(payload.new as Omit<InboxMessage, "attachment">),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => void addMessage(payload.new as Omit<InboxMessage, "attachment">),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as InboxMessage;
          setMessages((current) =>
            current.map((message) =>
              message.id === updated.id ? { ...message, read_at: updated.read_at } : message,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => setLiveNotice("You have a new message."),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [markConversationRead, selectedContact?.blocked, selectedId, supabase, userId]);

  function chooseFile(nextFile: File | undefined) {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    const extension = allowedFileTypes[nextFile.type];
    const fileName = nextFile.name.toLowerCase();
    const extensionMatches =
      extension === "jpg"
        ? fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        : Boolean(extension && fileName.endsWith(`.${extension}`));
    if (!extension || !extensionMatches) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setError("Choose a JPG, PNG, WebP, PDF, DOC, or DOCX file.");
      return;
    }
    if (nextFile.size < 1 || nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setError("Files must be 10 MB or smaller.");
      return;
    }
    setFile(nextFile);
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContact || selectedContact.blocked || !selectedContact.canMessage) return;
    const content = draft.trim() || (file ? "Shared an attachment." : "");
    if (!content) {
      setError("Write a message or attach a file.");
      return;
    }
    setSending(true);
    setError("");
    let uploadedPath: string | null = null;

    try {
      let attachmentArgs = {
        p_attachment_path: null as string | null,
        p_attachment_name: null as string | null,
        p_attachment_type: null as string | null,
        p_attachment_size: null as number | null,
      };

      if (file) {
        const extension = allowedFileTypes[file.type];
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("talantalink-inbox-files")
          .upload(uploadedPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("The file could not be uploaded.");
        attachmentArgs = {
          p_attachment_path: uploadedPath,
          p_attachment_name: file.name,
          p_attachment_type: file.type,
          p_attachment_size: file.size,
        };
      }

      const { data: messageId, error: sendError } = await supabase.rpc("send_message", {
        p_recipient_id: selectedContact.id,
        p_content: content,
        ...attachmentArgs,
      });
      if (sendError || !messageId) throw new Error("This message could not be sent.");

      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .select("id,sender_id,recipient_id,content,created_at,read_at")
        .eq("id", messageId)
        .single();
      if (messageError || !messageData) throw new Error("This message could not be loaded.");
      const { data: attachmentData } = await supabase
        .from("message_attachments")
        .select("message_id,storage_path,file_name,mime_type,file_size")
        .eq("message_id", messageId)
        .maybeSingle();
      const newMessage = {
        ...messageData,
        attachment: (attachmentData as MessageAttachment | null) ?? null,
      } as InboxMessage;
      setMessages((current) =>
        current.some((existing) => existing.id === newMessage.id)
          ? current
          : [newMessage, ...current].slice(0, 500),
      );
      setDraft("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      if (uploadedPath) {
        await supabase.storage.from("talantalink-inbox-files").remove([uploadedPath]);
      }
      setError(caught instanceof Error ? caught.message : "This message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function blockSelectedMember() {
    if (!selectedContact || selectedContact.blockedByMe) return;
    setError("");
    const { error: blockError } = await supabase.from("message_user_blocks").insert({
      blocker_id: userId,
      blocked_id: selectedContact.id,
    });
    if (blockError) {
      setError("This member could not be blocked.");
      return;
    }
    setContacts((current) =>
      current.map((contact) =>
        contact.id === selectedContact.id
          ? { ...contact, blocked: true, blockedByMe: true }
          : contact,
      ),
    );
    setMessages((current) =>
      current.filter(
        (message) =>
          message.sender_id !== selectedContact.id &&
          message.recipient_id !== selectedContact.id,
      ),
    );
    await refreshUnreadCount();
    setLiveNotice("This member has been blocked.");
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContact) return;
    const { error: reportError } = await supabase.from("message_user_reports").insert({
      reporter_id: userId,
      reported_user_id: selectedContact.id,
      reason: reportReason,
      details: reportDetails.trim(),
    });
    if (reportError) {
      setReportNotice("Your report could not be submitted.");
      return;
    }
    setReportOpen(false);
    setReportDetails("");
    setReportNotice("Your report was submitted.");
  }

  return (
    <section className={styles.inbox} aria-label="Messaging inbox">
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeading}>
          <h2>Conversations</h2>
          <span className={styles.unreadBadge} aria-label={`${unreadCount} unread messages`}>
            {unreadCount}
          </span>
        </div>
        {contacts.length === 0 ? (
          <p className={styles.emptySidebar}>
            Accepted connections will appear here when you’re ready to talk.
          </p>
        ) : (
          <ul className={styles.contactList}>
            {contacts.map((contact) => {
              const unread = messages.filter(
                (message) =>
                  message.sender_id === contact.id &&
                  message.recipient_id === userId &&
                  message.read_at === null,
              ).length;
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={`${styles.contactButton} ${selectedId === contact.id ? styles.contactSelected : ""}`}
                    onClick={() => {
                      setSelectedId(contact.id);
                      setError("");
                      setLiveNotice("");
                      if (!contact.blocked) void markConversationRead(contact.id);
                    }}
                    aria-current={selectedId === contact.id ? "page" : undefined}
                  >
                    <span className={styles.avatar}>
                      {contact.avatarUrl ? (
                        <Image
                          src={contact.avatarUrl}
                          alt=""
                          width={42}
                          height={42}
                          unoptimized
                        />
                      ) : (
                        contact.displayName.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className={styles.contactDetails}>
                      <span className={styles.contactName}>{contact.displayName}</span>
                      <span className={styles.contactSummary}>
                        {contact.blocked ? "Messaging unavailable" : "Private conversation"}
                      </span>
                    </span>
                    {unread > 0 && <span className={styles.contactUnread}>{unread}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className={styles.conversation}>
        {selectedContact ? (
          <>
            <header className={styles.conversationHeader}>
              <div>
                <h2>{selectedContact.displayName}</h2>
                <p>
                  {selectedContact.blocked
                    ? "Messaging is unavailable"
                    : selectedContact.canMessage
                      ? "Private conversation"
                      : "An accepted connection is required to send messages"}
                </p>
              </div>
              <div className={styles.safetyActions}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setReportOpen((open) => !open);
                    setReportNotice("");
                  }}
                >
                  Report
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={blockSelectedMember}
                  disabled={selectedContact.blockedByMe}
                >
                  {selectedContact.blockedByMe ? "Blocked" : "Block"}
                </button>
              </div>
            </header>

            {reportOpen && (
              <form className={styles.reportForm} onSubmit={submitReport}>
                <label>
                  Reason
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                  >
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment</option>
                    <option value="inappropriate">Inappropriate content</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Details (optional)
                  <textarea
                    maxLength={2000}
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                  />
                </label>
                <div className={styles.reportActions}>
                  <button type="button" className={styles.textButton} onClick={() => setReportOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.smallPrimaryButton}>Submit report</button>
                </div>
                {reportNotice && <p className={styles.inlineError} role="status">{reportNotice}</p>}
              </form>
            )}

            <div className={styles.messages} aria-live="polite">
              {conversationMessages.length === 0 ? (
                <p className={styles.emptyConversation}>
                  {selectedContact.blocked
                    ? "This conversation is unavailable."
                    : "Start a private conversation with a thoughtful message."}
                </p>
              ) : (
                conversationMessages.map((message) => {
                  const sent = message.sender_id === userId;
                  return (
                    <article
                      key={message.id}
                      className={`${styles.message} ${sent ? styles.messageSent : styles.messageReceived}`}
                    >
                      <p className={styles.messageText}>{message.content}</p>
                      {message.attachment && <AttachmentLink attachment={message.attachment} />}
                      <time className={styles.timestamp} dateTime={message.created_at}>
                        {formatTime(message.created_at)}
                      </time>
                    </article>
                  );
                })
              )}
            </div>

            <form className={styles.composer} onSubmit={sendMessage}>
              {file && (
                <div className={styles.filePreview}>
                  <span>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <button type="button" onClick={() => chooseFile(undefined)} aria-label="Remove attachment">
                    ×
                  </button>
                </div>
              )}
              <label className={styles.composerLabel} htmlFor="message-draft">Write a message</label>
              <textarea
                id="message-draft"
                value={draft}
                maxLength={5000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message…"
                disabled={selectedContact.blocked || !selectedContact.canMessage || sending}
              />
              <div className={styles.composerFooter}>
                <label className={styles.attachButton}>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => chooseFile(event.target.files?.[0])}
                    disabled={selectedContact.blocked || !selectedContact.canMessage || sending}
                  />
                  Attach file
                </label>
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={
                    sending ||
                    selectedContact.blocked ||
                    !selectedContact.canMessage ||
                    (!draft.trim() && !file)
                  }
                >
                  {sending ? "Sending…" : "Send message"}
                </button>
              </div>
              {error && <p className={styles.inlineError} role="alert">{error}</p>}
            </form>
          </>
        ) : (
          <div className={styles.noSelection}>
            <span aria-hidden="true">✉</span>
            <h2>Your conversations</h2>
            <p>
              {contacts.length > 0
                ? "Select a conversation to view messages."
                : "Connect with another member to start a private conversation."}
            </p>
          </div>
        )}
      </div>
      <p className={styles.liveNotice} role="status" aria-live="polite">{liveNotice}</p>
      {reportNotice && !reportOpen && (
        <p className={styles.reportToast} role="status">{reportNotice}</p>
      )}
    </section>
  );
}
