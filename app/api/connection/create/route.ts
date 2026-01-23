import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Autorizar primero
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

    // Validaciones básicas
    if (
      !type ||
      !connectionName ||
      !host ||
      !database ||
      !dbUser ||
      !password
    ) {
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );
    }

    const normalizedType = String(type).toLowerCase();
    if (!["mysql", "postgres", "postgresql"].includes(normalizedType)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de base de datos no soportado" },
        { status: 400 }
      );
    }

    let portNum: number | undefined = undefined;
    if (port !== undefined && port !== null && port !== "") {
      const n = Number(port);
      if (!Number.isFinite(n) || n < 1 || n > 65535) {
        return NextResponse.json(
          { ok: false, error: "Puerto inválido" },
          { status: 400 }
        );
      }
      portNum = n;
    }

    // Modo demo/mock: no persistimos aún, solo devolvemos un objeto simulado
    const now = new Date().toISOString();
    const id = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : `mock_${Math.random().toString(36).slice(2)}`;

    const mock = {
      id,
      name: connectionName,
      database_host: host,
      database_name: database,
      database_user: dbUser,
      // Por seguridad no retornamos la contraseña
      user_id: currentUser.id,
      port: portNum,
      created_at: now,
      type: normalizedType,
    };

    return NextResponse.json({
      ok: true,
      data: mock,
      message: "Conexión creada (modo demo)",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error creando la conexión" },
      { status: 500 }
    );
  }
}
