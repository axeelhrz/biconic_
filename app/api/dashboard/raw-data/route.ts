import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/backend-proxy";

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "/dashboard/raw-data");
}
