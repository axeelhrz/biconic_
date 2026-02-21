"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getEtlForPreview } from "@/app/admin/(main)/etl/actions";
import {
  Database,
  Link2,
  User,
  Building2,
  Calendar,
  FileText,
  Loader2,
  ArrowRight,
  Filter,
  Rows3,
  GitMerge,
  Unplug,
  Eraser,
  ListChecks,
} from "lucide-react";

type GuidedConfig = {
  connectionId?: string | number | null;
  filter?: {
    table?: string;
    columns?: string[];
    conditions?: Array<{ column: string; operator: string; value?: string }>;
    excludeRowsColumn?: string;
  };
  union?: {
    left?: { connectionId?: string | number; filter?: { table?: string; columns?: string[] } };
    rights?: Array<{ connectionId?: string | number; filter?: { table?: string; columns?: string[] } }>;
    right?: { connectionId?: string | number; filter?: { table?: string; columns?: string[] } };
    unionAll?: boolean;
  };
  join?: {
    primaryConnectionId?: string | number;
    primaryTable?: string;
    joins?: Array<{
      id?: string;
      secondaryConnectionId?: string | number;
      secondaryTable?: string;
      joinType?: string;
      primaryColumn?: string;
      secondaryColumn?: string;
      secondaryColumns?: string[];
    }>;
  };
  clean?: {
    transforms?: Array<{ column: string; op: string; find?: string; replaceWith?: string; replacement?: string }>;
    dedupe?: { keyColumns?: string[]; keep?: string };
  };
  end?: { target?: { table?: string; type?: string }; mode?: string };
};

type PreviewData = {
  id: string;
  title: string;
  name?: string;
  description: string;
  status: string;
  published?: boolean;
  created_at?: string;
  output_table?: string | null;
  ownerName: string | null;
  clientName: string | null;
  guidedConfig: GuidedConfig | null;
};

export default function EtlPreviewModal({
  etlId,
  open,
  onOpenChange,
  etlTitle,
}: {
  etlId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etlTitle?: string;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !etlId) return;
    setLoading(true);
    setError(null);
    getEtlForPreview(etlId)
      .then((res) => {
        if (res.ok && res.data) setData(res.data as PreviewData);
        else setError(res.error ?? "Error al cargar");
      })
      .catch(() => setError("Error al cargar"))
      .finally(() => setLoading(false));
  }, [open, etlId]);

  const filter = data?.guidedConfig?.filter;
  const end = data?.guidedConfig?.end;
  const created = data?.created_at
    ? new Date(data.created_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  const isPublished = data?.status === "Publicado" || data?.published;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[620px] p-0 gap-0 border-0 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1a1d21 0%, #141619 100%)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(34, 197, 94, 0.15)",
        }}
      >
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-semibold pr-8"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Vista previa del ETL
            </DialogTitle>
          </DialogHeader>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: "rgba(34, 197, 94, 0.9)" }}
            />
          </div>
        )}

        {error && (
          <p
            className="text-sm py-4 px-6"
            style={{ color: "#f87171" }}
          >
            {error}
          </p>
        )}

        {!loading && !error && data && (
          <div className="space-y-5 px-6 pb-6 pt-2">
            <div>
              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                {data.title || etlTitle || "Sin título"}
              </h3>
              {data.description && (
                <p
                  className="text-sm"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {data.description}
                </p>
              )}
              <span
                className="inline-block mt-2 rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: isPublished ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.08)",
                  color: isPublished ? "#4ade80" : "rgba(255,255,255,0.6)",
                }}
              >
                {isPublished ? "Publicado" : "Borrador"}
              </span>
            </div>

            <div
              className="rounded-xl border p-4 space-y-3"
              style={{
                borderColor: "rgba(34, 197, 94, 0.2)",
                background: "rgba(0,0,0,0.2)",
              }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                Información
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(34, 197, 94, 0.15)" }}
                  >
                    <User className="h-4 w-4" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Creado por
                    </p>
                    <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }}>
                      {data.ownerName || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(34, 197, 94, 0.15)" }}
                  >
                    <Building2 className="h-4 w-4" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Cliente
                    </p>
                    <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }}>
                      {data.clientName ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(34, 197, 94, 0.15)" }}
                  >
                    <Calendar className="h-4 w-4" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Creado
                    </p>
                    <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                      {created}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {data.guidedConfig && (
              <div
                className="rounded-xl border p-4 space-y-4 max-h-[50vh] overflow-y-auto"
                style={{
                  borderColor: "rgba(34, 197, 94, 0.15)",
                  background: "rgba(0,0,0,0.15)",
                }}
              >
                <h4
                  className="text-sm font-semibold flex items-center gap-2 sticky top-0 py-1"
                  style={{ color: "rgba(255,255,255,0.95)", background: "rgba(0,0,0,0.15)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                  Configuración del flujo
                </h4>

                <div className="space-y-4 text-sm">
                  {/* Origen */}
                  {(filter?.table != null && filter.table !== "") && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Link2 className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Origen</span>
                      </div>
                      <p className="font-medium" style={{ color: "rgba(255,255,255,0.95)" }}>Tabla {filter.table}</p>
                    </div>
                  )}

                  {/* Columnas (todas) */}
                  {(filter?.columns?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Database className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Columnas</span>
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>({filter!.columns!.length})</span>
                      </div>
                      <p className="text-xs leading-relaxed break-all" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {(filter!.columns as string[]).join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Condiciones de filtro */}
                  {(filter?.conditions?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Filter className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Condiciones</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {filter!.conditions!.map((c, i) => (
                          <li key={i}>
                            {c.column} {c.operator} {c.value != null ? String(c.value) : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Excluir filas */}
                  {filter?.excludeRowsColumn && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Rows3 className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Excluir filas por columna</span>
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>{filter.excludeRowsColumn}</p>
                    </div>
                  )}

                  {/* UNION */}
                  {data.guidedConfig.union && (data.guidedConfig.union.rights?.length ?? data.guidedConfig.union.right) && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <GitMerge className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>UNION</span>
                        {data.guidedConfig.union.unionAll !== false && (
                          <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>(ALL)</span>
                        )}
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {data.guidedConfig.union.rights?.map((r, i) => (
                          <li key={i}>Tabla: {r.filter?.table ?? "—"}</li>
                        ))}
                        {!data.guidedConfig.union.rights?.length && data.guidedConfig.union.right && (
                          <li>Tabla: {(data.guidedConfig.union.right as { filter?: { table?: string } }).filter?.table ?? "—"}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* JOIN */}
                  {data.guidedConfig.join?.joins?.length ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Unplug className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>JOIN</span>
                      </div>
                      <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Tabla principal: {data.guidedConfig.join.primaryTable ?? "—"}</p>
                      <ul className="list-none space-y-1.5 text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {data.guidedConfig.join.joins.map((j, i) => (
                          <li key={j.id ?? i} className="rounded border pl-2 py-1.5" style={{ borderColor: "rgba(34, 197, 94, 0.2)" }}>
                            <span className="font-medium">{j.secondaryTable ?? "—"}</span> ({j.joinType ?? "INNER"}) · {j.primaryColumn ?? "—"} = {j.secondaryColumn ?? "—"}
                            {j.secondaryColumns?.length ? (
                              <span className="block mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                                Columnas: {j.secondaryColumns.join(", ")}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Limpieza (clean) */}
                  {(data.guidedConfig.clean?.transforms?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Eraser className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Limpieza / transformaciones</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {data.guidedConfig.clean!.transforms!.map((t, i) => (
                          <li key={i}>
                            {t.column}: {t.op}
                            {t.find != null && ` "${t.find}" → ${t.replaceWith ?? t.replacement ?? ""}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.guidedConfig.clean?.dedupe?.keyColumns?.length ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ListChecks className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Deduplicar</span>
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.9)" }}>
                        Claves: {data.guidedConfig.clean.dedupe.keyColumns.join(", ")} · mantener: {data.guidedConfig.clean.dedupe.keep === "last" ? "último" : "primero"}
                      </p>
                    </div>
                  ) : null}

                  {/* Destino */}
                  {(end?.target?.table ?? data.output_table) && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Destino</span>
                      </div>
                      <p className="font-medium" style={{ color: "rgba(255,255,255,0.95)" }}>
                        {(end?.target?.table ?? data.output_table) || "—"}
                      </p>
                      {end?.mode && (
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {end.mode === "overwrite" ? "Sobrescribir" : "Agregar"}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!filter?.table && !end?.target?.table && !data.output_table && !data.guidedConfig.union && !data.guidedConfig.join?.joins?.length && !data.guidedConfig.clean?.transforms?.length && !data.guidedConfig.clean?.dedupe?.keyColumns?.length && (
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Sin configuración de flujo guardada.
                  </p>
                )}
              </div>
            )}

            {!data.guidedConfig && (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                Este ETL no tiene configuración de flujo guiado guardada.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
