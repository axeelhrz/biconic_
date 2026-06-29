import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  buildConnectionUpdateRow,
  getConnectionsTableColumns,
} from "@/lib/connection/connection-persistence";

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      connectionId,
      connectionName,
      host,
      database,
      user: dbUser,
      port,
      connection_tables,
    } = body || {};

    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "connectionId requerido" },
        { status: 400 }
      );
    }

    const adminClient = shouldUseOwnBackend() ? createServiceRoleClient() : null;
    const dbClient = adminClient ?? supabase;
    const columns = adminClient?._sql
      ? await getConnectionsTableColumns(adminClient._sql)
      : new Set([
          "name",
          "db_host",
          "db_name",
          "db_user",
          "db_port",
          "connection_tables",
          "config",
          "updated_at",
        ]);

    let existingConfig: Record<string, unknown> | null = null;
    if (adminClient?._sql && columns.has("config")) {
      const rows = await adminClient._sql<{ config: Record<string, unknown> | null }[]>`
        SELECT config FROM public.connections WHERE id = ${String(connectionId)}::uuid LIMIT 1
      `;
      existingConfig = rows[0]?.config ?? null;
    }

    const updateRow = buildConnectionUpdateRow(
      columns,
      {
        name: connectionName?.trim(),
        host: host?.trim(),
        database: database?.trim(),
        user: dbUser?.trim(),
        port: port != null && port !== "" ? Number(port) : undefined,
        connection_tables: Array.isArray(connection_tables)
          ? connection_tables.map((t: unknown) => String(t).trim()).filter(Boolean)
          : undefined,
      },
      existingConfig
    );

    if (Object.keys(updateRow).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para actualizar" }, { status: 400 });
    }

    const { error } = await dbClient
      .from("connections")
      .update(updateRow)
      .eq("id", String(connectionId));

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error actualizando la conexión",
      },
      { status: 500 }
    );
  }
}
