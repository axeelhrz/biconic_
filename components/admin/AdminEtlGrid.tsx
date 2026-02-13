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
};

type FilterType = "todos" | "publicados" | "borradores";

interface AdminEtlGridProps {
  searchQuery?: string;
  filter?: FilterType;
}

export default function AdminEtlGrid({
  searchQuery = "",
  filter = "todos",
}: AdminEtlGridProps) {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFromClient = useCallback(async (): Promise<Etl[]> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("etl")
      .select("*")
      .order("id", { ascending: false });
    if (error) throw error;
    const rows = (data as SupabaseEtlRow[] | null) ?? [];
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    let ownerById: Record<string, string | null> = {};
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ownerIds);
      ownerById = Object.fromEntries((owners ?? []).map((o: any) => [o.id, o.full_name ?? null]));
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
        lastExecution: (row as any).lastExecution ?? null,
        nextExecution: (row as any).nextExecution ?? null,
        createdAt: (row as any).createdAt ?? null,
        clientId: row.client_id ?? "",
        ownerId: row.user_id,
        owner: row.user_id ? { fullName: ownerById[row.user_id] ?? null } : undefined,
      } satisfies Etl;
    });
  }, []);

  const loadEtls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const timeoutMs = 8000;
      const adminPromise = getEtlsAdmin();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      );
      const res = await Promise.race([adminPromise, timeoutPromise]);
      if (res.ok && res.data) {
        const rows = (res.data ?? []) as SupabaseEtlRow[];
        const owners: Record<string, string | null> = res.owners ?? {};
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
            lastExecution: (row as any).lastExecution ?? null,
            nextExecution: (row as any).nextExecution ?? null,
            createdAt: (row as any).createdAt ?? null,
            clientId: row.client_id ?? "",
            ownerId: row.user_id,
            owner: row.user_id ? { fullName: owners[row.user_id] ?? null } : undefined,
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
  }, [loadFromClient]);

  useEffect(() => {
    loadEtls();
  }, [loadEtls]);

  // Refrescar lista solo cuando la pestaña vuelve a ser visible (p. ej. después de crear un ETL)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => loadEtls(), 300);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
    return matchesQuery && matchesFilter;
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
          onDeleted={loadEtls}
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
