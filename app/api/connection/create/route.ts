import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptConnectionPassword } from "@/lib/connection-secret";

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const {
      type,
      connectionName,
      host,
      database,
      user: dbUser,
      password,
      port,
    } = body || {};

    if (!type || !connectionName || !host || !database || !dbUser) {
      return NextResponse.json(
        { ok: false, error: "Faltan tipo, nombre, host, base de datos o usuario." },
        { status: 400 }
      );
    }

    const normalizedType = String(type).toLowerCase();
    if (!["mysql", "postgres", "postgresql", "firebird"].includes(normalizedType)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de conexión no soportado." },
        { status: 400 }
      );
    }

    let portNum: number;
    if (port !== undefined && port !== null && port !== "") {
      const n = Number(port);
      if (!Number.isFinite(n) || n < 1 || n > 65535) {
        return NextResponse.json({ ok: false, error: "Puerto inválido" }, { status: 400 });
      }
      portNum = n;
    } else {
      portNum = normalizedType === "firebird" ? 15421 : 5432;
    }

    const activeClientId = await getActiveClientId(supabase, currentUser.id);
    const passwordPlain = typeof password === "string" ? password : "";
    let db_password_encrypted: string | null = null;
    if (passwordPlain) {
      try {
        db_password_encrypted = encryptConnectionPassword(passwordPlain);
      } catch (e: any) {
        return NextResponse.json(
          { ok: false, error: e?.message || "No se pudo guardar la contraseña. Configurá ENCRYPTION_KEY en .env." },
          { status: 500 }
        );
      }
    }

    const { data: newConn, error } = await supabase
      .from("connections")
      .insert({
        name: connectionName.trim(),
        user_id: currentUser.id,
        client_id: activeClientId,
        type: normalizedType,
        db_host: host.trim(),
        db_name: database.trim(),
        db_user: dbUser.trim(),
        db_port: portNum,
        db_password_secret_id: null,
        db_password_encrypted,
      })
      .select("id, name, type")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { id: newConn.id, name: newConn.name, type: newConn.type },
      message: "Conexión creada correctamente.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error creando la conexión" },
      { status: 500 }
    );
  }
}

async function getActiveClientId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("client_members")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.client_id) return data.client_id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .single();
  if (profile?.app_role === "APP_ADMIN") return null;
  throw new Error("No se pudo encontrar un cliente asociado a tu cuenta.");
}
