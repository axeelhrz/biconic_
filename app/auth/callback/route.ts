import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

// This route completes the OAuth flow. Supabase will redirect back here with a code.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      new URL(`/auth/error?error=Missing OAuth code`, request.url)
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  // On success, redirect to the original destination
  return NextResponse.redirect(new URL(next, request.url));
}
