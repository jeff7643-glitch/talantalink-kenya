"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, openNotification } from "./actions";
import styles from "./notifications.module.css";

export type NotificationRecord = {
  id: string;
  actor_id: string | null;
  actorName: string | null;
  notification_type: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

function notificationTime(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationCentre({
  userId,
  notifications,
  unreadCount,
}: {
  userId: string;
  notifications: NotificationRecord[];
  unreadCount: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return (
    <section className={styles.centre} aria-labelledby="notifications-heading">
      <div className={styles.centreHeading}>
        <div>
          <h2 id="notifications-heading">Recent activity</h2>
          <p>{unreadCount ? `${unreadCount} unread` : "You’re all caught up."}</p>
        </div>
        <form action={markAllNotificationsRead}>
          <button className={styles.secondaryButton} type="submit" disabled={!unreadCount}>
            Mark all as read
          </button>
        </form>
      </div>

      {notifications.length ? (
        <ol className={styles.notificationList}>
          {notifications.map((notification) => (
            <li
              className={`${styles.notification} ${notification.read_at ? "" : styles.unread}`}
              key={notification.id}
            >
              <span className={styles.statusMark} aria-hidden="true" />
              <div className={styles.notificationCopy}>
                <p className={styles.notificationTitle}>
                  {notification.actorName && <span>{notification.actorName}: </span>}
                  {notification.title}
                </p>
                {notification.body && <p className={styles.notificationBody}>{notification.body}</p>}
                <time className={styles.timestamp} dateTime={notification.created_at}>
                  {notificationTime(notification.created_at)}
                </time>
              </div>
              <form action={openNotification}>
                <input type="hidden" name="notificationId" value={notification.id} />
                <button className={styles.openButton} type="submit">
                  Open
                  <span className={styles.visuallyHidden}>: {notification.title}</span>
                </button>
              </form>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">✓</span>
          <h3>No notifications yet</h3>
          <p>Updates about follows, posts, messages, applications and matching opportunities will appear here.</p>
        </div>
      )}
    </section>
  );
}
