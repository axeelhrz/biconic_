import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Sirve el GeoJSON de provincias AR (fallback si /geo/ no es accesible). */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "geo", "ar-provincias.geojson");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { type?: string; features?: unknown[] };
    if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      return NextResponse.json({ error: "Invalid GeoJSON" }, { status: 500 });
    }
    return new NextResponse(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "GeoJSON not found" }, { status: 404 });
  }
}
