"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formText(formData: FormData, key: string, maximum = 500) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function formUuid(formData: FormData, key: string) {
  const value = formText(formData, key, 36);
  if (!uuidPattern.test(value)) throw new Error("That record could not be found.");
  return value;
}

function formBoolean(formData: FormData, key: string) {
  const value = formText(formData, key, 5);
  if (value !== "true" && value !== "false") throw new Error("Choose a valid account status.");
  return value === "true";
}

async function adminContext() {
  const admin = await requireRole(["administrator"]);
  return { admin, supabase: await createSupabaseServerClient() };
}

function completeAction(error: { message: string } | null) {
  if (error) throw new Error(`Administrator action could not be completed: ${error.message}`);
  revalidatePath("/admin");
}

function requireUpdatedRow(data: unknown, error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: the record was not found or was already changed.`);
}

export async function setAccountSuspension(formData: FormData) {
  const { admin, supabase } = await adminContext();
  const userId = formUuid(formData, "userId");
  const suspended = formBoolean(formData, "suspended");
  const reason = formText(formData, "reason", 500);
  if (userId === admin.id) throw new Error("You cannot suspend your own account.");
  if (suspended && reason.length < 8) throw new Error("Add a short, clear reason before suspending an account.");

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !target) throw new Error("That account could not be found.");
  if (target.role === "administrator") throw new Error("Administrator accounts cannot be suspended here.");

  const { data, error } = await supabase
    .from("admin_account_status")
    .update({
      is_suspended: suspended,
      suspension_reason: suspended ? reason : null,
      suspended_by: suspended ? admin.id : null,
      suspended_at: suspended ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not update account status");
  if (suspended) {
    const { data: privateProfile, error: privacyError } = await supabase
      .from("profiles")
      .update({ is_public: false })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    requireUpdatedRow(privateProfile, privacyError, "Account suspended, but profile visibility could not be restricted");
  }
  revalidatePath("/admin");
}

export async function setTalentVerification(formData: FormData) {
  const { supabase } = await adminContext();
  const userId = formUuid(formData, "userId");
  const verified = formBoolean(formData, "verified");
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_verified: verified })
    .eq("id", userId)
    .eq("role", "talent")
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not update talent verification");
  completeAction(null);
}

export async function setEmployerVerification(formData: FormData) {
  const { supabase } = await adminContext();
  const companyId = formUuid(formData, "companyId");
  const verified = formBoolean(formData, "verified");
  const { data, error } = await supabase
    .from("companies")
    .update({ is_verified: verified })
    .eq("id", companyId)
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not update employer verification");
  completeAction(null);
}

export async function reviewContentReport(formData: FormData) {
  const { admin, supabase } = await adminContext();
  const reportId = formUuid(formData, "reportId");
  const decision = formText(formData, "decision", 10);
  if (decision !== "remove" && decision !== "dismiss") throw new Error("Choose a valid review decision.");

  const { data: report, error: reportError } = await supabase
    .from("content_reports")
    .select("id,target_type,target_id,status")
    .eq("id", reportId)
    .eq("status", "open")
    .maybeSingle();
  if (reportError || !report) throw new Error("This report has already been reviewed or is unavailable.");

  if (decision === "remove") {
    let removed: unknown = null;
    let removalError: { message: string } | null = null;
    if (report.target_type === "post") {
      ({ data: removed, error: removalError } = await supabase.from("posts")
        .update({ is_removed: true }).eq("id", report.target_id).select("id").maybeSingle());
    } else if (report.target_type === "comment") {
      ({ data: removed, error: removalError } = await supabase.from("comments")
        .update({ is_removed: true }).eq("id", report.target_id).select("id").maybeSingle());
    } else if (report.target_type === "profile") {
      ({ data: removed, error: removalError } = await supabase.from("profiles")
        .update({ is_public: false, is_moderation_hidden: true }).eq("id", report.target_id).select("id").maybeSingle());
    } else if (report.target_type === "opportunity") {
      ({ data: removed, error: removalError } = await supabase.from("opportunities")
        .update({ status: "closed", is_moderation_hidden: true }).eq("id", report.target_id).select("id").maybeSingle());
    } else {
      throw new Error("This report refers to an unsupported content type.");
    }
    requireUpdatedRow(removed, removalError, "Reported content could not be removed");
  }

  const { data, error } = await supabase
    .from("content_reports")
    .update({
      status: decision === "remove" ? "resolved" : "dismissed",
      resolution_note: decision === "remove" ? "Content hidden after administrator review." : "Report dismissed after review.",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not resolve the content report");
  completeAction(null);
}

export async function reviewAccountReport(formData: FormData) {
  const { admin, supabase } = await adminContext();
  const reportId = formUuid(formData, "reportId");
  const status = formText(formData, "decision", 10);
  if (status !== "resolved" && status !== "dismissed") throw new Error("Choose a valid review decision.");

  const { data, error } = await supabase
    .from("message_user_reports")
    .update({
      status,
      resolution_note: status === "resolved" ? "Reviewed by an administrator." : "Report dismissed after review.",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not resolve the account report");
  completeAction(null);
}

export async function reviewTrustSignal(formData: FormData) {
  const { admin, supabase } = await adminContext();
  const signalId = formUuid(formData, "signalId");
  const decision = formText(formData, "decision", 10);
  if (decision !== "resolved" && decision !== "dismissed") {
    throw new Error("Choose a valid trust signal decision.");
  }
  const { data, error } = await supabase
    .from("trust_safety_signals")
    .update({
      status: decision,
      resolution_note: decision === "resolved"
        ? "Suspicious link reviewed by an administrator."
        : "Suspicious link signal dismissed after review.",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", signalId)
    .in("status", ["open", "in_review"])
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not resolve the trust and safety signal");
  completeAction(null);
}

export async function setOpportunityStatus(formData: FormData) {
  const { supabase } = await adminContext();
  const opportunityId = formUuid(formData, "opportunityId");
  const status = formText(formData, "status", 12);
  if (!["draft", "published", "closed"].includes(status)) throw new Error("Choose a valid listing status.");
  const { data, error } = await supabase
    .from("opportunities")
    .update({ status })
    .eq("id", opportunityId)
    .select("id")
    .maybeSingle();
  requireUpdatedRow(data, error, "Could not update listing status");
  completeAction(null);
}

export async function saveTalentCategory(formData: FormData) {
  const { supabase } = await adminContext();
  const categoryId = formText(formData, "categoryId", 36);
  const name = formText(formData, "name", 80);
  if (name.length < 2) throw new Error("Category names must contain at least two characters.");
  if (categoryId) {
    if (!uuidPattern.test(categoryId)) throw new Error("That category could not be found.");
    const { data, error } = await supabase.from("talent_categories").update({ name }).eq("id", categoryId).select("id").maybeSingle();
    requireUpdatedRow(data, error, "Could not rename the category");
    completeAction(null);
    return;
  }
  const { data, error } = await supabase.from("talent_categories").insert({ name }).select("id").maybeSingle();
  requireUpdatedRow(data, error, "Could not add the category");
  completeAction(null);
}
