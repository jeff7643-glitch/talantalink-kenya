"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmployerActionState = { error?: string; notice?: string; companyId?: string };

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function employerAccount() {
  const account = await getAuthenticatedProfile();
  if (!account || !account.onboarding_complete || !["employer", "recruiter", "administrator"].includes(account.role)) {
    throw new Error("You are not authorized to manage an employer account.");
  }
  return account;
}

export async function saveCompanyProfile(
  _previousState: EmployerActionState,
  formData: FormData,
): Promise<EmployerActionState> {
  try {
    const account = await employerAccount();
    const companyId = value(formData, "companyId");
    const name = value(formData, "name");
    const description = value(formData, "description");
    const website = value(formData, "website");
    if (companyId && !/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "Choose a valid company." };
    if (!name || name.length > 160) return { error: "Enter an organization name of up to 160 characters." };
    if (description.length > 3000) return { error: "Keep the description to 3,000 characters or fewer." };
    if (website) {
      try {
        const parsed = new URL(website);
        if (parsed.protocol !== "https:") return { error: "Use a secure HTTPS website address." };
      } catch {
        return { error: "Enter a valid website address." };
      }
    }

    const supabase = await createSupabaseServerClient();
    if (companyId) {
      const { data, error } = await supabase
        .from("companies")
        .update({ name, description, website: website || null })
        .eq("id", companyId)
        .eq("owner_id", account.id)
        .select("id")
        .maybeSingle();
      if (error || !data) return { error: "Could not update this organization. Check your access and try again." };
      revalidatePath("/employer");
      revalidatePath("/opportunities");
      return { companyId: data.id, notice: "Organization profile saved." };
    }

    const { data, error } = await supabase
      .from("companies")
      .insert({ owner_id: account.id, name, description, website: website || null })
      .select("id")
      .single();
    if (error || !data) return { error: "Could not create this organization. Check your account permissions." };
    revalidatePath("/employer");
    revalidatePath("/opportunities");
    return { companyId: data.id, notice: "Organization profile created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save your organization profile." };
  }
}

export async function saveCompanyLogo(formData: FormData): Promise<EmployerActionState> {
  try {
    const account = await employerAccount();
    const companyId = value(formData, "companyId");
    const storagePath = value(formData, "storagePath");
    if (!/^[0-9a-f-]{36}$/i.test(companyId)
      || !new RegExp(`^${account.id}/${companyId}/[0-9a-f-]{36}\\.(jpg|png|webp|avif)$`, "i").test(storagePath)) {
      return { error: "The uploaded logo details are invalid." };
    }

    const supabase = await createSupabaseServerClient();
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,logo_storage_path")
      .eq("id", companyId)
      .eq("owner_id", account.id)
      .maybeSingle();
    if (companyError || !company) return { error: "Could not find an organization you manage." };

    const fileName = storagePath.split("/").pop();
    if (!fileName) return { error: "The uploaded logo path is invalid." };
    const { data: files, error: fileError } = await supabase.storage
      .from("talantalink-company-logos")
      .list(`${account.id}/${companyId}`, { search: fileName });
    if (fileError || !files?.some((file) => file.name === fileName)) {
      return { error: "The uploaded logo could not be verified." };
    }

    const { data: publicUrl } = supabase.storage.from("talantalink-company-logos").getPublicUrl(storagePath);
    const { error } = await supabase
      .from("companies")
      .update({ logo_url: publicUrl.publicUrl, logo_storage_path: storagePath })
      .eq("id", companyId)
      .eq("owner_id", account.id);
    if (error) {
      const { error: cleanupError } = await supabase.storage
        .from("talantalink-company-logos")
        .remove([storagePath]);
      if (cleanupError) return { error: "Could not update the organization logo or clean up its uploaded file." };
      return { error: "Could not update the organization logo." };
    }

    if (company.logo_storage_path && company.logo_storage_path !== storagePath) {
      const { error: removeError } = await supabase.storage
        .from("talantalink-company-logos")
        .remove([company.logo_storage_path]);
      if (removeError) return { error: "Logo updated, but the previous file could not be removed." };
    }
    revalidatePath("/employer");
    revalidatePath("/opportunities");
    return { notice: "Organization logo updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the organization logo." };
  }
}

export async function saveCompanyVerification(formData: FormData): Promise<EmployerActionState> {
  try {
    const account = await employerAccount();
    const companyId = value(formData, "companyId");
    const businessName = value(formData, "businessName");
    const registrationType = value(formData, "registrationType");
    const registrationNumber = value(formData, "registrationNumber");
    const documentPath = value(formData, "documentPath");
    if (!/^[0-9a-f-]{36}$/i.test(companyId)
      || !businessName || businessName.length > 160
      || !["business", "nonprofit", "public_body", "other"].includes(registrationType)
      || !registrationNumber || registrationNumber.length > 120
      || !new RegExp(`^${account.id}/${companyId}/[0-9a-f-]{36}\\.pdf$`, "i").test(documentPath)) {
      return { error: "Check the organization details and upload a valid PDF." };
    }

    const supabase = await createSupabaseServerClient();
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,is_verified,verification_requested_at")
      .eq("id", companyId)
      .eq("owner_id", account.id)
      .maybeSingle();
    if (companyError || !company) return { error: "Could not find an organization you manage." };
    if (company.is_verified) return { error: "This organization is already verified." };

    const { data: uploaded, error: uploadCheckError } = await supabase.rpc(
      "owns_uploaded_verification_document",
      { p_document_path: documentPath },
    );
    if (uploadCheckError || !uploaded) return { error: "The uploaded verification file could not be verified." };

    const { data: existing, error: existingError } = await supabase
      .from("company_verification_documents")
      .select("document_path")
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError) return { error: "Could not load the existing verification submission." };

    const document = {
      company_id: companyId,
      submitted_by: account.id,
      business_name: businessName,
      registration_type: registrationType,
      registration_number: registrationNumber,
      document_path: documentPath,
    };
    const saveResult = existing
      ? await supabase.from("company_verification_documents").update(document).eq("company_id", companyId).select("company_id").maybeSingle()
      : await supabase.from("company_verification_documents").insert(document).select("company_id").maybeSingle();
    if (saveResult.error || !saveResult.data) {
      const { error: cleanupError } = await supabase.storage
        .from("talantalink-verification-documents")
        .remove([documentPath]);
      if (cleanupError) return { error: "Could not save the verification submission or clean up its uploaded document." };
      return { error: "Could not save the verification submission. Confirm your organization details and try again." };
    }

    if (existing?.document_path && existing.document_path !== documentPath) {
      const { error: removeError } = await supabase.storage
        .from("talantalink-verification-documents")
        .remove([existing.document_path]);
      if (removeError) return { error: "Submission saved, but the previous verification file could not be removed." };
    }

    if (!company.verification_requested_at) {
      const { error: requestError } = await supabase
        .from("companies")
        .update({ verification_requested_at: new Date().toISOString() })
        .eq("id", companyId)
        .eq("owner_id", account.id);
      if (requestError) return { error: "Verification evidence saved, but its review request could not be recorded." };
    }
    revalidatePath("/employer");
    revalidatePath("/admin");
    return { notice: "Verification evidence submitted for review." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not submit organization verification." };
  }
}

export async function requestApplicantConnection(formData: FormData): Promise<EmployerActionState> {
  try {
    await employerAccount();
    const applicationId = value(formData, "applicationId");
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return { error: "Choose a valid application." };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("request_applicant_connection", {
      target_application_id: applicationId,
    });
    if (error) return { error: error.message || "Could not request a connection with this applicant." };
    revalidatePath("/employer");
    revalidatePath("/inbox");
    return { notice: "Connection request sent. You can message the applicant after they accept." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not contact the applicant." };
  }
}
