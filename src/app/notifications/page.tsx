import { Suspense } from "react";
import { requireCompletedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationCentre, {
  type NotificationRecord,
} from "./notification-centre";
import { saveNotificationPreferences } from "./actions";
import styles from "./notifications.module.css";

export const metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

const preferenceOptions = [
  ["notify_follows", "New followers", "When someone follows your talent profile."],
  ["notify_post_activity", "Post activity", "When someone appreciates or comments on your post."],
  ["notify_messages", "Private messages", "When you receive a new message."],
  ["notify_applications", "Applications", "When an employer changes an application status."],
  ["notify_matching_opportunities", "Matching opportunities", "When a new opportunity matches your profile."],
  ["notify_profile_verification", "Profile verification", "When your talent profile is verified."],
] as const;

async function NotificationContent({
  searchParams,
}: {
  searchParams: Promise<{ preferences?: string }>;
}) {
  const { preferences: preferencesSaved } = await searchParams;
  const profile = await requireCompletedProfile();
  const supabase = await createSupabaseServerClient();
  const [notificationsResult, preferencesResult, unreadResult] = await Promise.all([
    supabase
      .from("user_notifications")
      .select("id,actor_id,notification_type,title,body,href,read_at,created_at")
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_preferences")
      .select("notify_follows,notify_post_activity,notify_messages,notify_applications,notify_matching_opportunities,notify_profile_verification")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", profile.id)
      .is("read_at", null),
  ]);
  if (notificationsResult.error) throw new Error(`Could not load your notifications: ${notificationsResult.error.message}`);
  if (preferencesResult.error) throw new Error(`Could not load your notification preferences: ${preferencesResult.error.message}`);
  if (unreadResult.error) throw new Error(`Could not load your unread notification count: ${unreadResult.error.message}`);
  if (!preferencesResult.data) throw new Error("Your notification preferences are not initialized. Please contact support.");
  const preferences = preferencesResult.data;

  const notifications = notificationsResult.data ?? [];
  const actorIds = [...new Set(
    notifications
      .map((notification) => notification.actor_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const actorsResult = actorIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorsResult.error) throw new Error(`Could not load notification names: ${actorsResult.error.message}`);

  const actorNames = new Map((actorsResult.data ?? []).map((actor) => [actor.id, actor.display_name]));
  const notificationRecords: NotificationRecord[] = notifications.map((notification) => ({
    ...notification,
    actorName: notification.actor_id
      ? actorNames.get(notification.actor_id) ?? "TalantaLink member"
      : null,
  }));

  return (
    <>
      <NotificationCentre
        userId={profile.id}
        notifications={notificationRecords}
        unreadCount={unreadResult.count ?? 0}
      />
      <section className={styles.preferences} aria-labelledby="notification-preferences-heading">
        <div className={styles.preferencesHeading}>
          <div>
            <p className={styles.eyebrow}>YOUR SETTINGS</p>
            <h2 id="notification-preferences-heading">Notification preferences</h2>
          </div>
          <p>Choose which updates appear in your centre.</p>
        </div>
        {preferencesSaved === "saved" && <p className={styles.success} role="status">Your preferences have been saved.</p>}
        <form action={saveNotificationPreferences}>
          <div className={styles.preferenceList}>
            {preferenceOptions.map(([name, label, description]) => (
              <label className={styles.preference} key={name}>
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={preferences[name]}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          <button className={styles.saveButton} type="submit">Save preferences</button>
        </form>
      </section>
    </>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ preferences?: string }>;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>TALANTALINK UPDATES</p>
        <h1>Notification centre</h1>
        <p>Stay up to date with your community, applications and opportunities.</p>
      </header>
      <Suspense fallback={<div className={styles.loading} aria-busy="true">Loading your notifications…</div>}>
        <NotificationContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
