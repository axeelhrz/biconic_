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
} from "lucide-react";

type GuidedConfig = {
  connectionId?: string | number | null;
  filter?: { table?: string; columns?: string[]; excludeRowsColumn?: string };
  end?: { target?: { table?: string }; mode?: string };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-xl font-semibold pr-8"
            style={{ color: "var(--platform-fg)" }}
          >
            Vista previa del ETL
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: "var(--platform-accent)" }}
            />
          </div>
        )}

        {error && (
          <p
            className="text-sm py-4"
            style={{ color: "var(--platform-error, #dc2626)" }}
          >
            {error}
          </p>
        )}

        {!loading && !error && data && (
          <div className="space-y-6 pt-2">
            <div>
              <h3
                className="text-base font-semibold mb-1"
                style={{ color: "var(--platform-fg)" }}
              >
                {data.title || etlTitle || "Sin título"}
              </h3>
              {data.description && (
                <p
                  className="text-sm"
                  style={{ color: "var(--platform-fg-muted)" }}
                >
                  {data.description}
                </p>
              )}
            </div>

            <div
              className="rounded-xl border p-4 space-y-3"
              style={{
                borderColor: "var(--platform-border)",
                background: "var(--platform-bg)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--platform-surface-hover)" }}
                >
                  <User className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                    Dueño
                  </p>
                  <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                    {data.ownerName || "—"}
                  </p>
                </div>
              </div>
              {data.clientName != null && (
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--platform-surface-hover)" }}
                  >
                    <Building2 className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                      Cliente
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                      {data.clientName}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--platform-surface-hover)" }}
                >
                  <Calendar className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                    Creado
                  </p>
                  <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                    {created}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    background:
                      data.status === "Publicado" || data.published
                        ? "var(--platform-success-dim, rgba(34,197,94,0.15))"
                        : "var(--platform-surface-hover)",
                    color:
                      data.status === "Publicado" || data.published
                        ? "var(--platform-success, #22c55e)"
                        : "var(--platform-fg-muted)",
                  }}
                >
                  {data.status === "Publicado" || data.published ? "Publicado" : "Borrador"}
                </span>
              </div>
            </div>

            {data.guidedConfig && (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{
                  borderColor: "var(--platform-border)",
                  background: "var(--platform-bg)",
                }}
              >
                <h4
                  className="text-sm font-semibold flex items-center gap-2"
                  style={{ color: "var(--platform-fg)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
                  Configuración del flujo
                </h4>
                <div className="space-y-2 text-sm">
                  {filter?.table != null && filter.table !== "" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link2 className="h-4 w-4 shrink-0" style={{ color: "var(--platform-fg-muted)" }} />
                      <span style={{ color: "var(--platform-fg-muted)" }}>Origen:</span>
                      <span className="font-medium" style={{ color: "var(--platform-fg)" }}>
                        Tabla {filter.table}
                      </span>
                    </div>
                  )}
                  {(filter?.columns?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2">
                      <Database className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--platform-fg-muted)" }} />
                      <div>
                        <span style={{ color: "var(--platform-fg-muted)" }}>Columnas: </span>
                        <span style={{ color: "var(--platform-fg)" }}>
                          {filter?.columns?.slice(0, 5).join(", ") ?? ""}
                          {(filter?.columns?.length ?? 0) > 5 ? ` (+${(filter?.columns?.length ?? 0) - 5} más)` : ""}
                        </span>
                      </div>
                    </div>
                  )}
                  {(end?.target?.table ?? data.output_table) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--platform-fg-muted)" }} />
                      <span style={{ color: "var(--platform-fg-muted)" }}>Destino:</span>
                      <span className="font-medium" style={{ color: "var(--platform-fg)" }}>
                        {(end?.target?.table ?? data.output_table) || "—"}
                      </span>
                      {end?.mode && (
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                          ({end.mode === "overwrite" ? "Sobrescribir" : "Agregar"})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!filter?.table && !end?.target?.table && !data.output_table && (
                  <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                    Sin configuración de flujo guardada.
                  </p>
                )}
              </div>
            )}

            {!data.guidedConfig && (
              <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                Este ETL no tiene configuración de flujo guiado guardada.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
