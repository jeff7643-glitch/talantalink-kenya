"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrustReportState = {
  error?: string;
  success?: string;
};

const reasons = {
  scam: "Scam or fraudulent content",
  fee_request: "Requests payment or fees",
  misleading: "Misleading information",
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  other: "Other safety concern",
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitTrustReport(
  previousState: TrustReportState,
  formData: FormData,
): Promise<TrustReportState> {
  void previousState;

  const targetType = formData.get("targetType");
  const targetId = formData.get("targetId");
  const reason = formData.get("reason");
  const details = formData.get("details");

  if (
    typeof targetType !== "string"
    || !["post", "comment", "profile", "opportunity", "user"].includes(targetType)
    || typeof targetId !== "string"
    || !uuidPattern.test(targetId.trim())
    || typeof reason !== "string"
    || !Object.hasOwn(reasons, reason)
    || typeof details !== "string"
    || details.trim().length > 900
  ) {
    return { error: "Check the report details and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Sign in before submitting a report." };
  }

  const detailText = details.trim();
  const reasonText = reasons[reason as keyof typeof reasons];

  const result = targetType === "user"
    ? await supabase.from("message_user_reports").insert({
      reporter_id: user.id,
      reported_user_id: targetId.trim(),
      reason: ["spam", "harassment", "inappropriate"].includes(reason)
        ? reason
        : "other",
      details: [`Category: ${reasonText}`, detailText].filter(Boolean).join(". ").slice(0, 2000),
    })
    : await supabase.from("content_reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId.trim(),
      reason: [`Category: ${reasonText}`, detailText].filter(Boolean).join(". ").slice(0, 1000),
    });

  if (result.error) {
    if (result.error.code === "23505") {
      return { error: "You have already reported this item." };
    }

    if (result.error.code === "P0001") {
      return { error: "You have reached the reporting limit. Please try again later." };
    }

    return { error: "We could not submit this report. Check the target and try again." };
  }

  return { success: "Thank you. Your report has been sent for review." };
}
