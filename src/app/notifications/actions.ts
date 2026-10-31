"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompletedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const preferenceFields = [
  "notify_follows",
  "notify_post_activity",
  "notify_messages",
  "notify_applications",
  "notify_matching_opportunities",
  "notify_profile_verification",
] as const;

export async function saveNotificationPreferences(formData: FormData) {
  const profile = await requireCompletedProfile();
  const preferences = Object.fromEntries(
    preferenceFields.map((field) => [field, formData.get(field) === "on"]),
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: profile.id, ...preferences }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save notification preferences: ${error.message}`);

  revalidatePath("/notifications");
  redirect("/notifications?preferences=saved");
}

export async function markAllNotificationsRead() {
  const profile = await requireCompletedProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (error) throw new Error(`Could not mark notifications as read: ${error.message}`);
  revalidatePath("/notifications");
}

export async function openNotification(formData: FormData) {
  const profile = await requireCompletedProfile();
  const notificationId = String(formData.get("notificationId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) {
    throw new Error("Choose a valid notification.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: notification, error: lookupError } = await supabase
    .from("user_notifications")
    .select("href")
    .eq("id", notificationId)
    .eq("recipient_id", profile.id)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not load this notification: ${lookupError.message}`);
  if (!notification) redirect("/notifications");

  const { error: updateError } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", profile.id)
    .is("read_at", null);
  if (updateError) throw new Error(`Could not mark this notification as read: ${updateError.message}`);

  revalidatePath("/notifications");
  redirect(notification.href);
}
