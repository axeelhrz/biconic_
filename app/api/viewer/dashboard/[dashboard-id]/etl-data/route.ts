// src/app/api/viewer/dashboard/[dashboard-id]/etl-data/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  let dashboardId: string | undefined;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const awaitedParams = await params;
    dashboardId = awaitedParams["dashboard-id"];

    // 1) Obtener dashboard (sin filtrar por user_id) para saber si existe
    const { data: dashboard, error: dashboardError } = await supabase
      .from("dashboard")
      .select("*, etl:etl_id (id, title, name)")
      .eq("id", dashboardId)
      .maybeSingle();

    if (dashboardError || !dashboard) {
      return NextResponse.json(
        { ok: false, error: "Dashboard no encontrado" },
        { status: 404 }
      );
    }

    // 2) Verificar permisos: owner o permisos por client_members
    let hasAccess = false;
    if (dashboard.user_id === user.id) {
      hasAccess = true;
    } else {
      // Buscar memberships del usuario
      const { data: members, error: membersErr } = await supabase
        .from("client_members")
        .select("id")
        .eq("user_id", user.id);
      if (membersErr) {
        return NextResponse.json(
          { ok: false, error: "Error verificando permisos" },
          { status: 500 }
        );
      }
      const memberIds = (members ?? []).map((m: any) => m.id);
      if (memberIds.length > 0) {
        const { data: perms, error: permsErr } = await supabase
          .from("dashboard_has_client_permissions")
          .select("id")
          .in("client_member_id", memberIds)
          .eq("dashboard_id", dashboard.id)
          .eq("is_active", true);
        if (permsErr) {
          return NextResponse.json(
            { ok: false, error: "Error verificando permisos" },
            { status: 500 }
          );
        }
        if (perms && perms.length > 0) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { ok: false, error: "Sin permisos para ver este dashboard" },
        { status: 403 }
      );
    }

    // ===== A partir de aquí, lógica idéntica para recuperar metadatos ETL =====
    if (!dashboard.etl_id) {
      return NextResponse.json(
        { ok: false, error: "Dashboard no tiene ETL asociado" },
        { status: 400 }
      );
    }

    let sampleData: any[] = [];
    let rowCount = 0;
    let resolvedTableName: string | null = null;
    let resolvedSchema: string | null = null;
    let resolvedCreatedAt: string | null = null;

    const { data: latestRun, error: runErr } = await supabase
      .from("etl_runs_log")
      .select("destination_schema,destination_table_name,completed_at,status")
      .eq("etl_id", dashboard.etl_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!runErr && latestRun && latestRun.destination_table_name) {
      resolvedSchema = latestRun.destination_schema || "etl_output";
      resolvedTableName = latestRun.destination_table_name;
      resolvedCreatedAt = latestRun.completed_at || null;

      // Conteo
      const { count, error: countError } = await supabase
        .schema(resolvedSchema as "public" | "etl_output")
        // @ts-ignore
        .from(resolvedTableName)
        .select("*", { count: "exact", head: true });
      if (countError) throw countError;
      rowCount = count ?? 0;

      // Muestra
      if (rowCount > 0) {
        const { data, error: sampleError } = await supabase
          .schema(resolvedSchema as "public" | "etl_output")
          // @ts-ignore
          .from(resolvedTableName)
          .select("*")
          .limit(1);
        if (sampleError) throw sampleError;
        sampleData = data || [];
      }
    }

    if (sampleData.length === 0 && rowCount === 0) {
      const { data: legacy, error: legacyErr } = await supabase
        .from("etl_data_warehouse")
        .select("*")
        .eq("etl_id", dashboard.etl_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!legacyErr && legacy) {
        const legacyData = Array.isArray((legacy as any).data)
          ? (legacy as any).data
          : [];
        if (legacyData.length > 0) {
          sampleData = legacyData.slice(0, 1);
          rowCount = legacyData.length;
          resolvedCreatedAt = legacy.created_at;
          resolvedSchema = "public";
          resolvedTableName = "etl_data_warehouse";
        }
      }
    }

    if (sampleData.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontraron datos del ETL o la tabla está vacía",
        },
        { status: 404 }
      );
    }

    const sampleRow = sampleData[0] || {};
    const availableFields = Object.keys(sampleRow);
    const isNumericLike = (v: any): boolean => {
      if (typeof v === "number") return true;
      if (typeof v !== "string") return false;
      const trimmed = v.trim();
      if (!trimmed) return false;
      const sanitized = trimmed
        .replace(/\s+/g, "")
        .replace(/[%$€£]/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");
      return /^-?\d+(?:\.\d+)?$/.test(sanitized);
    };
    const numericFields = availableFields.filter((field) => {
      let nonNull = 0;
      let numericCount = 0;
      for (const row of sampleData) {
        const val = (row as any)[field];
        if (val === null || val === undefined) continue;
        nonNull++;
        if (isNumericLike(val)) numericCount++;
      }
      return nonNull > 0 && numericCount / nonNull >= 0.6;
    });
    const stringFields = availableFields.filter((field) => {
      if (numericFields.includes(field)) return false;
      const val0 = (sampleRow as any)[field];
      if (typeof val0 === "string" && !isNumericLike(val0)) return true;
      let nonNull = 0;
      let stringCount = 0;
      for (const row of sampleData) {
        const val = (row as any)[field];
        if (val === null || val === undefined) continue;
        nonNull++;
        if (typeof val === "string" && !isNumericLike(val)) stringCount++;
      }
      return nonNull > 0 && stringCount / nonNull >= 0.6;
    });
    const dateFields = availableFields.filter((field) => {
      let nonNull = 0;
      let dateCount = 0;
      for (const row of sampleData) {
        const v = (row as any)[field];
        if (v === null || v === undefined) continue;
        nonNull++;
        if (typeof v === "string" && !isNaN(Date.parse(v))) dateCount++;
      }
      return nonNull > 0 && dateCount / nonNull >= 0.6;
    });

    const elapsedTime = (Date.now() - startTime) / 1000;
    return NextResponse.json({
      ok: true,
      data: {
        dashboard,
        etl: dashboard.etl,
        etlData: {
          id: 0,
          name: resolvedTableName || "etl_output",
          created_at: resolvedCreatedAt || new Date().toISOString(),
          dataArray: [],
          rowCount: rowCount,
        },
        fields: {
          all: availableFields,
          numeric: numericFields,
          string: stringFields,
          date: dateFields,
        },
      },
    });
  } catch (error: any) {
    const elapsedTime = (Date.now() - startTime) / 1000;
    return NextResponse.json(
      { ok: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
