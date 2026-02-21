"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, BarChart3, Loader2, ChevronRight } from "lucide-react";
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="flex flex-col gap-4 rounded-2xl border p-6 w-full max-w-md"
            style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
              Crear métricas para un ETL
            </h2>
            <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Seleccioná un ETL para ir a su pantalla de creación de métricas.
            </p>
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>
                Buscar ETL
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
                <Input
                  placeholder="Por nombre o título..."
                  value={etlQuery}
                  onChange={(e) => setEtlQuery(e.target.value)}
                  className="pl-9 rounded-xl border"
                  style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                />
              </div>
            </div>
            <div
              className="max-h-[240px] overflow-y-auto rounded-xl border p-2 space-y-1"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
            >
              {etlOptionsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--platform-accent)" }} />
                </div>
              ) : etlOptions.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "var(--platform-fg-muted)" }}>
                  {etlQuery ? "Sin resultados" : "Escribí para buscar ETLs"}
                </p>
              ) : (
                etlOptions.map((etl) => (
                  <button
                    key={etl.id}
                    type="button"
                    onClick={() => setSelectedEtlId(etl.id)}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
                    style={{
                      background: selectedEtlId === etl.id ? "var(--platform-accent-dim)" : "transparent",
                      color: selectedEtlId === etl.id ? "var(--platform-accent)" : "var(--platform-fg)",
                    }}
                  >
                    <span>{etl.title}</span>
                    {selectedEtlId === etl.id && <ChevronRight className="h-4 w-4" />}
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl"
                style={{ borderColor: "var(--platform-border)" }}
              >
                Cancelar
              </Button>
              <Button
                onClick={goToCreateForEtl}
                disabled={!selectedEtlId}
                className="rounded-xl"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              >
                Ir a crear métricas
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
