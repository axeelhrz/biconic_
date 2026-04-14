import type { Dashboard } from "@/components/dashboard/DashboardCard";

/** Alineado con admin overview y filas legacy (`published`, `status`). */
export function dashboardPublishedStatusFromRow(row: {
  status?: string | null;
  published?: boolean | null;
  visibility?: string | null;
}): Dashboard["status"] {
  if (row.status === "Publicado" || row.status === "Borrador") {
    return row.status;
  }
  if (row.published === true) return "Publicado";
  const v = String(row.visibility ?? "")
    .trim()
    .toLowerCase();
  if (v === "public" || v === "published" || v === "publicado") {
    return "Publicado";
  }
  return "Borrador";
}
