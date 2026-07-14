import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLIENT_MEMBER_ACTIVE_OR_FILTER } from "@/lib/client-members/clientMembershipActive";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("client_members")
      .select(
        `
        id,
        client_id,
        role,
        clients (
          company_name,
          individual_full_name,
          type
        )
      `
      )
      .eq("user_id", user.id)
      .or(CLIENT_MEMBER_ACTIVE_OR_FILTER);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
