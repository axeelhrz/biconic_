import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testDatabaseConnection } from "@/lib/connection/test-database-connection";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, host, database, user, password, port } = body || {};

    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (!type || !host || !user) {
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );
    }

    const result = await testDatabaseConnection({
      type,
      host,
      database,
      user,
      password,
      port,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error probando la conexión";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
