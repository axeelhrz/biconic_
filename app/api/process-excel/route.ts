import { NextResponse } from "next/server";
import { getBackendApiUrl } from "@/lib/api/backend-config";
import { createImportAdminClient } from "@/lib/excel-import/import-admin-client";
import {
  runProcessExcelImport,
  type ParseMode,
} from "@/lib/excel-import/process-data-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Alineado con vercel.json (plan Pro / Fluid Compute). */
export const maxDuration = 800;

function parseParseMode(raw: unknown): ParseMode {
  if (raw === "strict" || raw === "tolerant" || raw === "mixed") return raw;
  return "mixed";
}

async function delegateImportToRailway(input: {
  connectionId: string;
  dataTableId: string;
  parseMode: ParseMode;
  selectedSheet: string | null;
  continuation?: boolean;
  forceReimport?: boolean;
}): Promise<Response> {
  const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
  const res = await fetch(`${getBackendApiUrl()}/internal/excel/run-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-internal-process-excel": secret } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "No se pudo iniciar la importación en Railway.",
        stage: "process_excel_start",
        details: text.slice(0, 500) || `HTTP ${res.status}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Procesamiento iniciado en Railway",
    delegated: true,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body?.connectionId || !body?.dataTableId) {
      return NextResponse.json(
        {
          error: "Faltan parámetros.",
          stage: "request_validation",
          details: "Se requieren connectionId y dataTableId.",
        },
        { status: 400 }
      );
    }

    const { connectionId, dataTableId } = body;
    const continuation = Boolean(body?.continuation);
    const forceReimport = Boolean(body?.forceReimport);
    const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
    if (continuation && secret && req.headers.get("x-internal-process-excel") !== secret) {
      return NextResponse.json(
        {
          error: "No autorizado.",
          stage: "continuation_auth",
          details: "Continuación interna rechazada (INTERNAL_PROCESS_EXCEL_SECRET).",
        },
        { status: 403 }
      );
    }

    const parseMode = parseParseMode(body?.parseMode);
    const selectedSheet =
      typeof body?.selectedSheet === "string" && body.selectedSheet.trim() !== ""
        ? body.selectedSheet.trim()
        : null;

    const importInput = {
      connectionId,
      dataTableId,
      parseMode,
      selectedSheet,
      continuation,
      forceReimport,
      cookieHeader: req.headers.get("cookie"),
    };

    // En Vercel el disco /tmp es ~512 MB: delegar importación al backend Railway.
    if (process.env.VERCEL) {
      return delegateImportToRailway(importInput);
    }

    if (!continuation) {
      const admin = createImportAdminClient();
      const { error: queueError } = await admin
        .from("data_tables")
        .update({ import_status: "processing" })
        .eq("id", dataTableId);
      if (queueError) {
        return NextResponse.json(
          {
            error: "No se pudo encolar la importación.",
            stage: "process_excel_start",
            details: queueError.message,
          },
          { status: 500 }
        );
      }
    }

    const importPromise = runProcessExcelImport(importInput).catch((err) =>
      console.error("[FATAL BACKGROUND ERROR]", err)
    );

    const { after } = await import("next/server");
    after(() => importPromise);

    return NextResponse.json({
      success: true,
      message: "Procesamiento iniciado en segundo plano",
    });
  } catch (error: unknown) {
    console.error("[ERROR POST process-excel]", error);
    return NextResponse.json(
      {
        error: "Error interno al iniciar la importación.",
        stage: "process_excel_start",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
