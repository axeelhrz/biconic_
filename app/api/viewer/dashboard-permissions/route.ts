import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const memberIdsParam = req.nextUrl.searchParams.get("memberIds") ?? "";
    const memberIds = memberIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (memberIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("dashboard_has_client_permissions")
      .select("dashboard_id, client_member_id, is_active")
      .in("client_member_id", memberIds)
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
