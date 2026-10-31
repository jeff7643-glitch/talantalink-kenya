import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./reset-password-form";

export const metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

async function ResetPasswordContent() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth?error=verification");

  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page" aria-busy="true" />}><ResetPasswordContent /></Suspense>;
}
