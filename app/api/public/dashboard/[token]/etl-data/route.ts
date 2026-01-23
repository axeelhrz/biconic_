import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "token": string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const awaitedParams = await params;
    const token = awaitedParams["token"];

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Token required" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // 1) Obtener dashboard por token
    const { data: dashboard, error: dashboardError } = await supabase
      .from("dashboard")
      .select("*, etl:etl_id (id, title, name)")
      .eq("share_token", token)
      .maybeSingle();

    if (dashboardError || !dashboard) {
      return NextResponse.json(
        { ok: false, error: "Dashboard no encontrado" },
        { status: 404 }
      );
    }

    // Visibility Check
    if (dashboard.visibility === 'private') {
         return NextResponse.json(
            { ok: false, error: "Dashboard is private" },
            { status: 403 }
         );
    }

    // Public Route: No auth check needed. 
    // Implicitly, if you have the UUID, you can view it.

    if (!dashboard.etl_id) {
        // Return empty structure if no ETL, to allow viewer to render empty state
        return NextResponse.json({
            ok: true,
            data: {
                dashboard,
                etl: null,
                etlData: null,
                fields: { all: [], numeric: [], string: [], date: [] }
            }
        });
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
      
       // Ignore error if table doesn't exist anymore? 
       // If countError, we just assume 0 rows.
      rowCount = count ?? 0;

      // Muestra
      if (rowCount > 0) {
        const { data, error: sampleError } = await supabase
          .schema(resolvedSchema as "public" | "etl_output")
          // @ts-ignore
          .from(resolvedTableName)
          .select("*")
          .limit(1);
        if (!sampleError) {
            sampleData = data || [];
        }
      }
    }

    // Fallback to legacy
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
    
    // Unlike the internal API, we don't 404 if data is missing, we just return empty.
    // Use standard field inference logic
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
    return NextResponse.json(
      { ok: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
