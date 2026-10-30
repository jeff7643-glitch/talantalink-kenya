import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null, origin: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (new URL(value, origin).origin !== origin) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"), requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (requestUrl.searchParams.has("error") || (!code && !tokenHash)) {
    return NextResponse.redirect(new URL("/auth?error=verification", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const authResult = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : type && ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(type)
      ? await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      })
      : { error: new Error("The verification link is invalid or has expired.") };

  if (authResult.error) {
    return NextResponse.redirect(new URL("/auth?error=verification", request.url));
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
