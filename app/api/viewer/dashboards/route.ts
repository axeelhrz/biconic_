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

    const sp = req.nextUrl.searchParams;
    const eqUserId = sp.get("eq_user_id");
    const inIds = (sp.get("in_id") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const inClientIds = (sp.get("in_client_id") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (eqUserId) {
      const { data, error } = await supabase
        .from("dashboard")
        .select("*")
        .eq("user_id", eqUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    if (inIds.length > 0) {
      const { data, error } = await supabase.from("dashboard").select("*").in("id", inIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    if (inClientIds.length > 0) {
      const { data, error } = await supabase
        .from("dashboard")
        .select("*")
        .in("client_id", inClientIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    const { data, error } = await supabase.from("dashboard").select("*").eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
