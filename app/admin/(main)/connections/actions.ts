"use server";

import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { listAdminConnectionsForGridFromDb } from "@/lib/admin/connections-repository";
import type { Connection } from "@/components/connections/ConnectionsCard";

export async function listAdminConnections(): Promise<Connection[]> {
  if (shouldUseOwnBackend()) {
    try {
      return await listAdminConnectionsForGridFromDb();
    } catch (err) {
      console.error("listAdminConnections:", err);
      return [];
    }
  }
  return [];
}
