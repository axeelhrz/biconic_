import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testDatabaseConnection } from "@/lib/connection/test-database-connection";

type TestBody = {
  type: string;
  host: string;
  database: string;
  user: string;
  password?: string;
  port?: number;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as TestBody | null;
    if (!body?.type || !body.host || !body.database || !body.user) {
      return NextResponse.json(
        { ok: false, error: "Faltan tipo, host, base de datos o usuario" },
        { status: 400 }
      );
    }

    const result = await testDatabaseConnection(body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al probar la conexión";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
