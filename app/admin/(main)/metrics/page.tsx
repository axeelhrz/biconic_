"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, BarChart3, Loader2, ChevronRight, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchEtls } from "@/app/admin/(main)/dashboard/actions";

type SavedMetric = { id: string; name: string; metric: { func?: string; field?: string; alias?: string } };
type EtlWithMetrics = { id: string; title: string; name: string; savedMetrics: SavedMetric[] };

export default function AdminMetricsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [etls, setEtls] = useState<EtlWithMetrics[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [etlQuery, setEtlQuery] = useState("");
  const [etlOptions, setEtlOptions] = useState<{ id: string; title: string }[]>([]);
  const [etlOptionsLoading, setEtlOptionsLoading] = useState(false);
  const [selectedEtlId, setSelectedEtlId] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/metrics");
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setEtls([]);
        return;
      }
      setEtls(json.data?.etls ?? []);
    } catch {
      setEtls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    const t = setTimeout(() => {
      setEtlOptionsLoading(true);
      searchEtls(etlQuery)
        .then(setEtlOptions)
        .catch(() => setEtlOptions([]))
        .finally(() => setEtlOptionsLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [etlQuery, createOpen]);

  const goToCreateForEtl = () => {
    if (selectedEtlId) {
      setCreateOpen(false);
      setSelectedEtlId(null);
      setEtlQuery("");
      router.push(`/admin/etl/${selectedEtlId}/metrics`);
    }
  };

  const totalMetrics = etls.reduce((acc, e) => acc + (e.savedMetrics?.length ?? 0), 0);
  const etlsWithMetrics = etls.filter((e) => (e.savedMetrics?.length ?? 0) > 0);

  return (
    <div className="flex w-full flex-col gap-8 p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-[48px]" style={{ color: "var(--platform-fg)" }}>
            Métricas (Admin)
          </h1>
          <p className="text-base font-normal leading-6" style={{ color: "var(--platform-fg-muted)" }}>
            Gestioná métricas reutilizables por ETL y usalas como gráficos en los dashboards.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-full px-6 font-medium hover:opacity-90"
          style={{ color: "var(--platform-accent-fg)", background: "var(--platform-accent)" }}
        >
          <Plus className="h-5 w-5" />
          Crear métrica
        </Button>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="flex flex-col w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            style={{
              background: "var(--platform-surface)",
              border: "1px solid var(--platform-border)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px var(--platform-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-6 pt-6 pb-4"
              style={{ borderBottom: "1px solid var(--platform-border)", background: "var(--platform-bg-elevated)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                    Crear métricas
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                    Elegí un ETL para definir métricas reutilizables
                  </p>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="px-6 pt-5 pb-4">
              <div className="relative rounded-xl transition-all duration-200">
                <Search
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--platform-fg-muted)" }}
                />
                <Input
                  placeholder="Buscar por nombre o título del ETL..."
                  value={etlQuery}
                  onChange={(e) => setEtlQuery(e.target.value)}
                  className="pl-11 pr-4 h-12 rounded-xl border-0 text-base placeholder:text-[var(--platform-fg-muted)] focus-visible:ring-2 focus-visible:ring-[var(--platform-accent)]"
                  style={{
                    background: "var(--platform-bg)",
                    color: "var(--platform-fg)",
                    border: "1px solid var(--platform-border)",
                  }}
                />
              </div>
            </div>

            {/* Results */}
            <div
              className="flex-1 min-h-[200px] max-h-[320px] overflow-y-auto px-4 pb-4"
              style={{ background: "var(--platform-bg-elevated)" }}
            >
              {etlOptionsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                    Buscando ETLs...
                  </p>
                </div>
              ) : etlOptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                    style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}
                  >
                    <Database className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--platform-fg)" }}>
                    {etlQuery ? "Sin resultados" : "Escribí para buscar"}
                  </p>
                  <p className="text-xs max-w-[240px]" style={{ color: "var(--platform-fg-muted)" }}>
                    {etlQuery
                      ? "No hay ETLs que coincidan con tu búsqueda. Probá con otro término."
                      : "Ingresá el nombre o título del ETL para ver opciones."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5 py-1">
                  {etlOptions.map((etl) => (
                    <li key={etl.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedEtlId(etl.id)}
                        className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 group hover:border-[var(--platform-border)] hover:bg-[var(--platform-surface)]"
                        style={{
                          background: selectedEtlId === etl.id ? "var(--platform-accent-dim)" : "transparent",
                          color: selectedEtlId === etl.id ? "var(--platform-accent)" : "var(--platform-fg)",
                          borderColor: selectedEtlId === etl.id ? "var(--platform-accent)" : "transparent",
                        }}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: selectedEtlId === etl.id ? "var(--platform-accent)" : "var(--platform-bg)",
                            color: selectedEtlId === etl.id ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                          }}
                        >
                          <Database className="h-4 w-4" />
                        </div>
                        <span className="flex-1 font-medium text-sm truncate">{etl.title}</span>
                        {selectedEtlId === etl.id ? (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: "var(--platform-fg-muted)" }} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4"
              style={{ borderTop: "1px solid var(--platform-border)", background: "var(--platform-surface)" }}
            >
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl h-10 px-5 font-medium"
                style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
              >
                Cancelar
              </Button>
              <Button
                onClick={goToCreateForEtl}
                disabled={!selectedEtlId}
                className="rounded-xl h-10 px-5 font-medium gap-2"
                style={{
                  background: selectedEtlId ? "var(--platform-accent)" : "var(--platform-bg-elevated)",
                  color: selectedEtlId ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                }}
              >
                Continuar al ETL
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
        </div>
      ) : etlsWithMetrics.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          <BarChart3 className="h-12 w-12 mx-auto mb-4" style={{ color: "var(--platform-fg-muted)" }} />
          <p className="text-base font-medium mb-1" style={{ color: "var(--platform-fg)" }}>
            Aún no hay métricas creadas
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
            Creá métricas desde un ETL (Ejecutar → Creación de métricas) o elegí un ETL arriba para empezar.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            variant="outline"
            className="rounded-full"
            style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear métrica
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            {totalMetrics} métrica{totalMetrics !== 1 ? "s" : ""} en {etlsWithMetrics.length} ETL{etlsWithMetrics.length !== 1 ? "s" : ""}.
          </p>
          {etlsWithMetrics.map((etl) => (
            <section
              key={etl.id}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
            >
              <div
                className="flex items-center justify-between gap-4 px-4 py-3 border-b"
                style={{ borderColor: "var(--platform-border)" }}
              >
                <Link
                  href={`/admin/etl/${etl.id}/metrics`}
                  className="font-semibold text-base hover:underline"
                  style={{ color: "var(--platform-accent)" }}
                >
                  {etl.title || etl.name || etl.id}
                </Link>
                <Link
                  href={`/admin/etl/${etl.id}/metrics`}
                  className="flex items-center gap-1 text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
                  style={{ color: "var(--platform-accent)", background: "var(--platform-accent-dim)" }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Gestionar
                </Link>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
                {(etl.savedMetrics ?? []).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <span className="font-medium text-sm" style={{ color: "var(--platform-fg)" }}>
                      {m.name}
                    </span>
                    <span className="text-xs truncate max-w-[50%]" style={{ color: "var(--platform-fg-muted)" }}>
                      {m.metric?.func}({m.metric?.field ?? "—"}) {m.metric?.alias ? `as ${m.metric.alias}` : ""}
                    </span>
                    <Link
                      href={`/admin/etl/${etl.id}/metrics`}
                      className="text-sm font-medium shrink-0"
                      style={{ color: "var(--platform-accent)" }}
                    >
                      Editar
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
