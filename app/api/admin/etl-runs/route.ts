import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  deleteEtlRunsFromDb,
  queryEtlRunsFromDb,
  type EtlRunsQuery,
} from "@/lib/admin/etl-runs-repository";

function parseQuery(url: URL): EtlRunsQuery {
  const query: EtlRunsQuery = { eq: {}, in: {} };

  const select = url.searchParams.get("select");
  if (select) query.columns = select;

  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("eq_") && value) {
      query.eq![key.slice(3)] = value;
    }
    if (key.startsWith("in_") && value) {
      query.in![key.slice(3)] = value.split(",").map((v: any) => v.trim()).filter(Boolean);
    }
  }

  const order = url.searchParams.get("order");
  if (order) {
    const [column, dir] = order.split(":");
    if (column) {
      query.order = { column, ascending: dir !== "desc" };
    }
  }

  const limit = url.searchParams.get("limit");
  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) query.limit = n;
  }

  if (query.eq && !Object.keys(query.eq).length) delete query.eq;
  if (query.in && !Object.keys(query.in).length) delete query.in;

  return query;
}

export async function GET(req: Request) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  try {
    const rows = await queryEtlRunsFromDb(parseQuery(new URL(req.url)));
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "No autorizado" || message === "Solo administradores" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    await deleteEtlRunsFromDb(ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "No autorizado" || message === "Solo administradores" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
