"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Database, Loader2, ChevronRight, Pencil, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchEtls } from "@/app/admin/(main)/dashboard/actions";

type DatasetRow = {
  id: string;
  etl_id: string;
  name: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
  etl_title: string | null;
};

export default function AdminDatasetsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [etlQuery, setEtlQuery] = useState("");
  const [etlOptions, setEtlOptions] = useState<{ id: string; title: string }[]>([]);
  const [etlOptionsLoading, setEtlOptionsLoading] = useState(false);
  const [selectedEtlId, setSelectedEtlId] = useState<string | null>(null);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/datasets");
      const json = await res.json();
      if (res.ok && json.ok && Array.isArray(json.data?.datasets)) {
        setDatasets(json.data.datasets);
      } else {
        setDatasets([]);
      }
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

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

  const goToCreateDataset = () => {
    if (selectedEtlId) {
      setCreateOpen(false);
      setSelectedEtlId(null);
      setEtlQuery("");
      router.push(`/admin/etl/${selectedEtlId}/dataset`);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex w-full flex-col min-h-0">
      <section
        className="rounded-3xl border px-6 py-8 sm:px-8 sm:py-10 mb-8"
        style={{
          background: "linear-gradient(135deg, var(--platform-bg-elevated) 0%, var(--platform-surface) 50%)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
            >
              <Database className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                Datasets
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Creá y gestioná la configuración de datasets (grain, tiempo, roles, relaciones) para usarlos en métricas sin volver a configurar cada vez.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 rounded-xl font-semibold gap-2 h-12 px-6 shadow-lg hover:shadow-xl transition-all"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            <Plus className="h-5 w-5" />
            Crear dataset
          </Button>
        </div>
      </section>

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
            <div
              className="px-6 pt-6 pb-4"
              style={{ borderBottom: "1px solid var(--platform-border)", background: "var(--platform-bg-elevated)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                    Crear dataset
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                    Elegí un ETL para configurar su dataset (grain, tiempo, roles, relaciones)
                  </p>
                </div>
              </div>
            </div>

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
                      ? "No hay ETLs que coincidan con tu búsqueda."
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
                onClick={goToCreateDataset}
                disabled={!selectedEtlId}
                className="rounded-xl h-10 px-5 font-medium gap-2"
                style={{
                  background: selectedEtlId ? "var(--platform-accent)" : "var(--platform-bg-elevated)",
                  color: selectedEtlId ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                }}
              >
                Configurar dataset
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
        </div>
      ) : datasets.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          <Database className="h-12 w-12 mx-auto mb-4" style={{ color: "var(--platform-fg-muted)" }} />
          <p className="text-base font-medium mb-1" style={{ color: "var(--platform-fg)" }}>
            Aún no hay datasets creados
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
            Creá un dataset eligiendo un ETL y configurando grain, tiempo, roles y relaciones. Luego podés usarlo al crear métricas.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            variant="outline"
            className="rounded-full"
            style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear dataset
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}.
          </p>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <div
              className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
            >
              <div className="sm:col-span-4">Nombre</div>
              <div className="sm:col-span-3">ETL</div>
              <div className="sm:col-span-2">Actualizado</div>
              <div className="sm:col-span-3 text-right">Acciones</div>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
              {datasets.map((ds) => (
                <li
                  key={ds.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-4 py-3 items-center"
                >
                  <div className="sm:col-span-4 font-medium text-sm" style={{ color: "var(--platform-fg)" }}>
                    {ds.name || "—"}
                  </div>
                  <div className="sm:col-span-3 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                    {ds.etl_title || ds.etl_id || "—"}
                  </div>
                  <div className="sm:col-span-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                    {formatDate(ds.updated_at)}
                  </div>
                  <div className="sm:col-span-3 flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/etl/${ds.etl_id}/dataset`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{ color: "var(--platform-accent)", background: "var(--platform-accent-dim)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Link>
                    <Link
                      href={`/admin/etl/${ds.etl_id}/metrics`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{ color: "var(--platform-fg-muted)", border: "1px solid var(--platform-border)" }}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Ir a métricas
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
