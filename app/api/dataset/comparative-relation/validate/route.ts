import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { shouldUseOwnBackend } from "@/lib/api/backend-proxy";
import { parseComparativeFieldMapping, type ComparativeFieldMapping } from "@/lib/dataset/comparativeRelation";
import { validateComparativeRelation } from "@/lib/dataset/validateComparativeRelation";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const baseDatasetId = typeof body.baseDatasetId === "string" ? body.baseDatasetId.trim() : "";
    const comparativeDatasetId =
      typeof body.comparativeDatasetId === "string" ? body.comparativeDatasetId.trim() : "";

    const fieldMappings: ComparativeFieldMapping[] = Array.isArray(body.fieldMappings)
      ? body.fieldMappings
          .map(parseComparativeFieldMapping)
          .filter((m: ComparativeFieldMapping | null): m is ComparativeFieldMapping => m != null)
      : [];

    if (!baseDatasetId || !comparativeDatasetId || fieldMappings.length === 0) {
      return NextResponse.json(
        { ok: false, error: "baseDatasetId, comparativeDatasetId y fieldMappings son requeridos" },
        { status: 400 }
      );
    }

    const dbClient = shouldUseOwnBackend() ? createServiceRoleClient() : supabase;

    const validation = await validateComparativeRelation(dbClient, {
      baseDatasetId,
      comparativeDatasetId,
      fieldMappings,
    });

    return NextResponse.json({ ok: true, data: { validation } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al validar relación comparativa";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
