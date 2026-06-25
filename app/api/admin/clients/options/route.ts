import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { listCompanyOptionsFromDb } from "@/lib/admin/clients-repository";

/** GET /api/admin/clients/options — empresas para selects (backend propio). */
export async function GET() {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json([], { status: 404 });
  }
  try {
    const rows = await listCompanyOptionsFromDb();
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/admin/clients/options:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
