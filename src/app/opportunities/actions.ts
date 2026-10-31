"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MarketplaceActionState = { error?: string; notice?: string };

const opportunityTypes = [
  "job",
  "audition",
  "internship",
  "competition",
  "freelance_gig",
  "sponsorship",
] as const;
const allowedDocumentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const cvDocumentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function marketplaceAccount(roles: readonly string[]) {
  const account = await getAuthenticatedProfile();
  if (!account || !account.onboarding_complete || !roles.includes(account.role)) {
    throw new Error("You are not authorized to perform this action.");
  }
  return account;
}

export async function createOpportunity(
  _previousState: MarketplaceActionState,
  formData: FormData,
): Promise<MarketplaceActionState> {
  try {
    const account = await marketplaceAccount(["employer", "recruiter", "administrator"]);
    const title = value(formData, "title");
    const description = value(formData, "description");
    const requirements = value(formData, "requirements");
    const companyName = value(formData, "companyName");
    const location = value(formData, "location");
    const contactEmail = value(formData, "contactEmail");
    const type = value(formData, "type");
    const compensation = value(formData, "compensation");
    const deadline = value(formData, "deadline");
    const status = value(formData, "status");

    if (!companyName || companyName.length > 160) return { error: "Enter a company or organizer name." };
    if (!title || title.length > 160) return { error: "Enter a title of 1–160 characters." };
    if (!description || description.length > 5000) return { error: "Add a description of up to 5,000 characters." };
    if (!requirements || requirements.length > 5000) return { error: "Add requirements of up to 5,000 characters." };
    if (!location || location.length > 200) return { error: "Enter a location of up to 200 characters." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Enter a valid contact email." };
    if (!(opportunityTypes as readonly string[]).includes(type)) return { error: "Choose a valid opportunity type." };
    if (["job", "internship", "freelance_gig", "sponsorship"].includes(type) && !compensation) {
      return { error: "Add the compensation, stipend, fee or sponsorship details." };
    }
    if (compensation.length > 500) return { error: "Keep compensation details to 500 characters or fewer." };
    if (!deadline || !Number.isFinite(Date.parse(deadline)) || Date.parse(deadline) <= Date.now()) {
      return { error: "Choose a future application deadline." };
    }
    if (status !== "draft" && status !== "published") return { error: "Choose draft or published." };

    const supabase = await createSupabaseServerClient();
    const { data: existingCompany, error } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", account.id)
      .eq("name", companyName)
      .maybeSingle();
    if (error) return { error: "Could not load your organization." };

    let company = existingCompany;
    if (!company) {
      const created = await supabase
        .from("companies")
        .insert({ owner_id: account.id, name: companyName })
        .select("id")
        .single();
      if (created.error || !created.data) return { error: "Could not create your organization. Check your account permissions." };
      company = created.data;
    }

    const result = await supabase.from("opportunities").insert({
      company_id: company.id,
      title,
      description,
      requirements,
      type,
      location,
      contact_email: contactEmail,
      compensation: compensation || null,
      deadline: new Date(`${deadline}T23:59:59.000Z`).toISOString(),
      status,
    });
    if (result.error) return { error: "Could not save this opportunity. Review the details and try again." };
    revalidatePath("/opportunities");
    return { notice: status === "published" ? "Opportunity published." : "Draft saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this opportunity." };
  }
}

export async function submitApplication(formData: FormData) {
  const account = await marketplaceAccount(["talent"]);
  const opportunityId = value(formData, "opportunityId");
  const message = value(formData, "message");
  if (!/^[0-9a-f-]{36}$/i.test(opportunityId)) throw new Error("Choose a valid opportunity.");
  if (message.length > 3000) throw new Error("Your message must be 3,000 characters or fewer.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications")
    .insert({
      opportunity_id: opportunityId,
      applicant_id: account.id,
      message,
      status: "submitted",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.code === "23505" ? "You have already applied to this opportunity." : "Could not submit your application.");
  revalidatePath("/opportunities");
  return { applicationId: data.id };
}

export async function registerApplicationDocument(formData: FormData): Promise<MarketplaceActionState> {
  try {
    const account = await marketplaceAccount(["talent"]);
    const applicationId = value(formData, "applicationId");
    const documentType = value(formData, "documentType");
    const fileName = value(formData, "fileName");
    const storagePath = value(formData, "storagePath");
    const mimeType = value(formData, "mimeType");
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)
      || !["cv", "portfolio"].includes(documentType)
      || !fileName || fileName.length > 180
      || !allowedDocumentTypes.has(mimeType)
      || (documentType === "cv" && !cvDocumentTypes.has(mimeType))
      || !storagePath.startsWith(`${account.id}/${applicationId}/`)) {
      return { error: "The uploaded file details are invalid." };
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("opportunity_application_documents").insert({
      application_id: applicationId,
      applicant_id: account.id,
      document_type: documentType,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
    });
    if (error) return { error: "Could not attach the uploaded file to your application." };
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not attach the uploaded file." };
  }
}

export async function updateApplicationStatus(formData: FormData): Promise<MarketplaceActionState> {
  try {
    await marketplaceAccount(["employer", "recruiter", "administrator"]);
    const applicationId = value(formData, "applicationId");
    const status = value(formData, "status");
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)
      || !["reviewing", "shortlisted", "accepted", "rejected"].includes(status)) {
      return { error: "Choose a valid application status." };
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("applications").update({ status }).eq("id", applicationId).select("id").single();
    if (error || !data) return { error: "Could not update this application. Check that you own the opportunity." };
    revalidatePath("/opportunities");
    return { notice: "Application status updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the application." };
  }
}

export async function updateOpportunityStatus(formData: FormData): Promise<MarketplaceActionState> {
  try {
    await marketplaceAccount(["employer", "recruiter", "administrator"]);
    const opportunityId = value(formData, "opportunityId");
    const status = value(formData, "status");
    if (!/^[0-9a-f-]{36}$/i.test(opportunityId)
      || !["published", "closed"].includes(status)) {
      return { error: "Choose a valid listing status." };
    }
    const supabase = await createSupabaseServerClient();
    if (status === "published") {
      const { data: listing, error: listingError } = await supabase
        .from("opportunities")
        .select("deadline")
        .eq("id", opportunityId)
        .maybeSingle();
      if (listingError || !listing) return { error: "Could not find a listing you own." };
      if (new Date(listing.deadline).getTime() <= Date.now()) return { error: "Set a future deadline before publishing this listing." };
    }
    const { data, error } = await supabase.from("opportunities").update({ status }).eq("id", opportunityId).select("id").single();
    if (error || !data) return { error: "Could not update this listing. Check that you own it." };
    revalidatePath("/opportunities");
    return { notice: status === "published" ? "Opportunity published." : "Opportunity closed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the listing." };
  }
}

export async function withdrawApplication(formData: FormData): Promise<MarketplaceActionState> {
  try {
    const account = await marketplaceAccount(["talent"]);
    const applicationId = value(formData, "applicationId");
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return { error: "Choose a valid application." };
    const supabase = await createSupabaseServerClient();
    const { data: documents, error: documentsError } = await supabase
      .from("opportunity_application_documents")
      .select("storage_path")
      .eq("application_id", applicationId)
      .eq("applicant_id", account.id);
    if (documentsError) return { error: "Could not load your application files. Try again." };
    const uploadedPaths = formData.getAll("uploadedPath").map(String);
    if (uploadedPaths.some((path) => !path.startsWith(`${account.id}/${applicationId}/`))) {
      return { error: "The application file paths are invalid." };
    }
    const paths = [...new Set([...(documents ?? []).map((document) => document.storage_path), ...uploadedPaths])];
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("talantalink-application-files")
        .remove(paths);
      if (storageError) return { error: "Could not remove your application files. Try again." };
    }
    const { error } = await supabase.from("applications").delete().eq("id", applicationId);
    if (error) return { error: "Could not withdraw this application." };
    revalidatePath("/opportunities");
    return { notice: "Application withdrawn." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not withdraw the application." };
  }
}
