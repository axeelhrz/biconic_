"use client";
import { useCallback, useEffect, useState } from "react";
import EtlCard, { Etl } from "@/components/etl/EtlCard";
import { createClient } from "@/lib/supabase/client";
import { getEtlsAdmin } from "@/app/admin/(main)/etl/actions";

// Optional shape to help with mapping Supabase rows to the Etl UI type
type SupabaseEtlRow = {
  id: string | number;
  title?: string;
  name?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null;
  published?: boolean | null;
  description?: string | null;
  views?: number | null;
  user_id?: string;
  client_id?: string | null;
  created_at?: string | null;
  lastExecution?: string | null;
  createdAt?: string | null;
};

function formatEtlDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatEtlDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type FilterType = "todos" | "publicados" | "borradores";

interface AdminEtlGridProps {
  searchQuery?: string;
  filter?: FilterType;
  clientId?: string;
}

export default function AdminEtlGrid({
  searchQuery = "",
  filter = "todos",
  clientId = "",
}: AdminEtlGridProps) {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFromClient = useCallback(async (): Promise<Etl[]> => {
    const supabase = createClient();
    let query = supabase
      .from("etl")
      .select("*")
      .order("created_at", { ascending: false });
    if (clientId && clientId.trim() !== "") {
      query = query.eq("client_id", clientId.trim());
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as SupabaseEtlRow[] | null) ?? [];
    const etlIds = rows.map((r) => String(r.id)).filter(Boolean);
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];

    let lastRunByEtlId: Record<string, string> = {};
    if (etlIds.length > 0) {
      const { data: runs } = await supabase
        .from("etl_runs_log")
        .select("etl_id, completed_at, started_at")
        .in("etl_id", etlIds)
        .order("started_at", { ascending: false });
      for (const run of runs ?? []) {
        const id = (run as { etl_id?: string | null }).etl_id;
        if (id && lastRunByEtlId[id] == null)
          lastRunByEtlId[id] =
            (run as { completed_at?: string | null }).completed_at ??
            (run as { started_at?: string }).started_at ??
            "";
      }
    }
    let ownerById: Record<string, string | null> = {};
    let clientById: Record<string, string | null> = {};
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ownerIds);
      ownerById = Object.fromEntries((owners ?? []).map((o: { id: string; full_name?: string | null }) => [o.id, o.full_name ?? null]));
    }
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, company_name, individual_full_name")
        .in("id", clientIds);
      clientById = Object.fromEntries(
        (clientRows ?? []).map((c: { id: string; company_name?: string | null; individual_full_name?: string | null }) => [
          c.id,
          (c.company_name || c.individual_full_name) ?? null,
        ])
      );
    }
    return rows.map((row) => {
      const status: Etl["status"] =
        row.status === "Publicado" || row.status === "Borrador"
          ? row.status
          : row.published
          ? "Publicado"
          : "Borrador";
      return {
        id: String(row.id),
        title: row.title ?? row.name ?? "Sin título",
        imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
        status,
        description: row.description ?? "",
        views: typeof row.views === "number" ? row.views : 0,
        lastExecution: formatEtlDateTime(lastRunByEtlId[String(row.id)] ?? (row as SupabaseEtlRow).lastExecution),
        nextExecution: "", // No hay próxima ejecución en el modelo actual
        createdAt: formatEtlDate((row as SupabaseEtlRow).created_at ?? (row as SupabaseEtlRow).createdAt),
        clientId: row.client_id ?? "",
        ownerId: row.user_id,
        owner: row.user_id ? { fullName: ownerById[row.user_id] ?? null } : undefined,
        client: row.client_id ? { name: clientById[row.client_id] ?? null } : undefined,
      } satisfies Etl;
    });
  }, [clientId]);

  const loadEtls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const timeoutMs = 8000;
      const adminPromise = getEtlsAdmin({ clientId: clientId?.trim() || undefined });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      );
      const res = await Promise.race([adminPromise, timeoutPromise]);
      if (res.ok && res.data) {
        const rows = (res.data ?? []) as SupabaseEtlRow[];
        const owners: Record<string, string | null> = res.owners ?? {};
        const clients: Record<string, string | null> = res.clients ?? {};
        const mapped: Etl[] = rows.map((row) => {
          const status: Etl["status"] =
            row.status === "Publicado" || row.status === "Borrador"
              ? row.status
              : row.published
              ? "Publicado"
              : "Borrador";
          return {
            id: String(row.id),
            title: row.title ?? row.name ?? "Sin título",
            imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
            status,
            description: row.description ?? "",
            views: typeof row.views === "number" ? row.views : 0,
            lastExecution: formatEtlDateTime((row as SupabaseEtlRow).lastExecution),
            nextExecution: "", // No hay próxima ejecución en el modelo actual
            createdAt: formatEtlDate((row as SupabaseEtlRow).created_at ?? (row as SupabaseEtlRow).createdAt),
            clientId: row.client_id ?? "",
            ownerId: row.user_id,
            owner: row.user_id ? { fullName: owners[row.user_id] ?? null } : undefined,
            client: row.client_id ? { name: clients[row.client_id] ?? null } : undefined,
          } satisfies Etl;
        });
        setEtls(mapped);
        return;
      }
      const mapped = await loadFromClient();
      setEtls(mapped);
    } catch {
      try {
        const mapped = await loadFromClient();
        setEtls(mapped);
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? "Error cargando ETLs");
        setEtls([]);
      }
    } finally {
      setLoading(false);
    }
  }, [loadFromClient, clientId]);

  useEffect(() => {
    loadEtls();
  }, [loadEtls]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-[15px] border"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
            }}
          >
            <div className="h-[193px] w-full" style={{ background: "var(--platform-surface-hover)" }} />
            <div className="space-y-3 p-5">
              <div className="h-4 w-1/2 rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-3 w-1/3 rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-3 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: "var(--platform-danger)",
          background: "rgba(248,113,113,0.1)",
          color: "var(--platform-danger)",
        }}
      >
        {error}
      </div>
    );
  }

  // Apply client-side filtering based on props
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = etls.filter((d) => {
    const matchesQuery = normalizedQuery
      ? d.title.toLowerCase().includes(normalizedQuery) ||
        d.description.toLowerCase().includes(normalizedQuery)
      : true;
    const matchesFilter =
      filter === "todos"
        ? true
        : filter === "publicados"
        ? d.status === "Publicado"
        : d.status === "Borrador";
    const matchesClient = !clientId?.trim() || (d.clientId ?? "") === clientId.trim();
    return matchesQuery && matchesFilter && matchesClient;
  });

  if (etls.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center text-sm"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
          color: "var(--platform-fg-muted)",
        }}
      >
        No hay etls en la plataforma.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {(filtered.length > 0 ? filtered : []).map((etl) => (
        <EtlCard
          key={etl.id}
          etl={etl}
          basePath="/admin/etl"
          editPathSuffix="/edit"
          onDeleted={loadEtls}
          onSaved={loadEtls}
          useAdminDelete
        />
      ))}
      {filtered.length === 0 && (
        <div
          className="col-span-full rounded-xl border p-6 text-center text-sm"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
            color: "var(--platform-fg-muted)",
          }}
        >
          No hay resultados para los filtros aplicados.
        </div>
      )}
    </div>
  );
}
