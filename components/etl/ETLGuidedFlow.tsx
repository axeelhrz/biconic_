"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Database,
  Filter,
  Table,
  Play,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";
import { toast } from "sonner";

const STEPS = [
  { id: "origen", label: "Origen", icon: Database },
  { id: "filtros", label: "Columnas y filtros", icon: Filter },
  { id: "destino", label: "Destino", icon: Table },
  { id: "ejecutar", label: "Ejecutar", icon: Play },
] as const;

type StepId = (typeof STEPS)[number]["id"];

async function fetchMetadata(connectionId: string | number, tableName?: string): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 35000);
  try {
    return await fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableName ? { connectionId, tableName } : { connectionId }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(to);
  }
}

type Props = {
  etlId: string;
  connections: ServerConnection[];
  initialStep?: StepId;
};

export default function ETLGuidedFlow({ etlId, connections, initialStep = "origen" }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(initialStep);
  const [connectionId, setConnectionId] = useState<string | number | null>(null);
  const [tables, setTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Array<{ column: string; operator: string; value?: string }>>([]);
  const [outputTableName, setOutputTableName] = useState("");
  const [outputMode, setOutputMode] = useState<"overwrite" | "append">("overwrite");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);

  // Cargar tablas al elegir conexión
  useEffect(() => {
    if (!connectionId) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    let cancelled = false;
    setLoadingMeta(true);
    fetchMetadata(connectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setTables(data.metadata.tables || []);
        setSelectedTable(null);
        setColumns([]);
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo cargar la lista de tablas");
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // Cargar columnas al elegir tabla (si la tabla viene con columnas vacías, pedirlas)
  const selectedTableInfo = tables.find(
    (t) => `${t.schema}.${t.name}` === selectedTable
  );
  const hasColumns = (selectedTableInfo?.columns?.length ?? 0) > 0;

  const loadColumnsForTable = useCallback(() => {
    if (!connectionId || !selectedTable) return;
    setLoadingColumns(selectedTable);
    fetchMetadata(connectionId, selectedTable)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok || !data.metadata?.tables?.[0]?.columns) {
          setLoadingColumns(null);
          return;
        }
        const cols = data.metadata.tables[0].columns.map((c: { name: string }) => c.name);
        setTables((prev) =>
          prev.map((t) =>
            `${t.schema}.${t.name}` === selectedTable
              ? { ...t, columns: data.metadata.tables[0].columns }
              : t
          )
        );
        setColumns((prev) => (prev.length ? prev : cols));
      })
      .finally(() => setLoadingColumns(null));
  }, [connectionId, selectedTable]);

  useEffect(() => {
    if (selectedTable && !hasColumns && !loadingColumns) loadColumnsForTable();
  }, [selectedTable, hasColumns, loadColumnsForTable, loadingColumns]);

  const canRun =
    connectionId &&
    selectedTable &&
    outputTableName.trim().length > 0 &&
    /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  const handleRun = async () => {
    if (!canRun || !connectionId || !selectedTable) return;
    setRunning(true);
    try {
      const res = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etlId,
          connectionId,
          filter: {
            table: selectedTable,
            columns: columns.length > 0 ? columns : undefined,
            conditions: conditions.length > 0 ? conditions : [],
          },
          end: {
            target: { type: "supabase", table: outputTableName.trim() },
            mode: outputMode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al ejecutar ETL");
      }
      setRunId(data.runId);
      setRunSuccess(true);
      toast.success("ETL iniciado. Los datos se guardarán en segundo plano.");
    } catch (e: any) {
      toast.error(e?.message || "Error al ejecutar");
    } finally {
      setRunning(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const connectionName =
    connections.find((c) => String(c.id) === String(connectionId))?.title ?? "";

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden" style={{ background: "var(--platform-surface)", border: "1px solid var(--platform-border)" }}>
      {/* Stepper */}
      <div className="flex items-center gap-2 p-4 border-b shrink-0" style={{ borderColor: "var(--platform-border)" }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isPast = stepIndex > i;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => !runSuccess && setStep(s.id)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: isActive ? "var(--platform-accent-dim)" : "transparent",
                color: isActive ? "var(--platform-accent)" : isPast ? "var(--platform-fg)" : "var(--platform-fg-muted)",
              }}
            >
              <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: isActive ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: isActive ? "var(--platform-bg)" : "inherit" }}>
                {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              {s.label}
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 opacity-50" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {step === "origen" && (
          <div className="space-y-6 max-w-xl">
            <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
              Elegí la fuente de datos
            </h3>
            <div>
              <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
              <select
                value={connectionId ?? ""}
                onChange={(e) => setConnectionId(e.target.value ? e.target.value : null)}
                className="w-full mt-2 rounded-xl border px-4 py-3 text-sm"
                style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
              >
                <option value="">Seleccionar conexión…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || `Conexión ${c.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
              {loadingMeta ? (
                <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando tablas…
                </div>
              ) : (
                <select
                  value={selectedTable ?? ""}
                  onChange={(e) => setSelectedTable(e.target.value || null)}
                  className="w-full mt-2 rounded-xl border px-4 py-3 text-sm"
                  style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                  disabled={!connectionId || tables.length === 0}
                >
                  <option value="">Seleccionar tabla…</option>
                  {tables.map((t) => (
                    <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                      {t.schema}.{t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedTable && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                onClick={() => setStep("filtros")}
              >
                Siguiente: Columnas y filtros <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {step === "filtros" && (
          <div className="space-y-6 max-w-xl">
            <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
              Columnas y condiciones (opcional)
            </h3>
            <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Dejá todas las columnas o elegí las que quieras. Agregá filtros si necesitás.
            </p>
            {loadingColumns === selectedTable ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando columnas…
              </div>
            ) : (selectedTableInfo?.columns?.length ?? 0) > 0 ? (
              <div>
                <Label className="text-sm mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Columnas a incluir (vacío = todas)</Label>
                <div className="flex flex-wrap gap-2">
                  {(selectedTableInfo?.columns ?? []).map((c) => {
                    const active = columns.length === 0 || columns.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          const allNames = (selectedTableInfo?.columns ?? []).map((x) => x.name);
                          if (active) {
                            if (columns.length === 0) setColumns(allNames.filter((n) => n !== c.name));
                            else setColumns((prev) => prev.filter((x) => x !== c.name));
                          } else {
                            setColumns((prev) => (prev.length + 1 === allNames.length ? [] : [...prev, c.name]));
                          }
                        }}
                        className="rounded-full px-3 py-1.5 text-xs font-medium border transition-colors"
                        style={{
                          background: active ? "var(--platform-accent-dim)" : "var(--platform-surface-hover)",
                          borderColor: "var(--platform-border)",
                          color: active ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                style={{ borderColor: "var(--platform-border)" }}
                onClick={() => setStep("origen")}
              >
                Atrás
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                onClick={() => setStep("destino")}
              >
                Siguiente: Destino <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "destino" && (
          <div className="space-y-6 max-w-xl">
            <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
              Tabla de destino
            </h3>
            <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Nombre de la tabla donde se guardarán los datos (solo letras, números y guión bajo). El dashboard usará esta tabla.
            </p>
            <div>
              <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Nombre de la tabla</Label>
              <Input
                value={outputTableName}
                onChange={(e) => setOutputTableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
                placeholder="ej. ventas_2025"
                className="mt-2 rounded-xl"
                style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
              />
            </div>
            <div>
              <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Modo</Label>
              <select
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value as "overwrite" | "append")}
                className="w-full mt-2 rounded-xl border px-4 py-3 text-sm"
                style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
              >
                <option value="overwrite">Sobrescribir (reemplazar tabla)</option>
                <option value="append">Agregar (añadir filas)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                style={{ borderColor: "var(--platform-border)" }}
                onClick={() => setStep("filtros")}
              >
                Atrás
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                onClick={() => setStep("ejecutar")}
              >
                Ir a Ejecutar <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "ejecutar" && (
          <div className="space-y-6 max-w-xl">
            {!runSuccess ? (
              <>
                <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                  Resumen y ejecución
                </h3>
                <ul className="text-sm space-y-2" style={{ color: "var(--platform-fg-muted)" }}>
                  <li><strong style={{ color: "var(--platform-fg)" }}>Conexión:</strong> {connectionName}</li>
                  <li><strong style={{ color: "var(--platform-fg)" }}>Tabla origen:</strong> {selectedTable}</li>
                  <li><strong style={{ color: "var(--platform-fg)" }}>Tabla destino:</strong> {outputTableName || "—"}</li>
                  <li><strong style={{ color: "var(--platform-fg)" }}>Modo:</strong> {outputMode === "overwrite" ? "Sobrescribir" : "Agregar"}</li>
                </ul>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => setStep("destino")}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={handleRun}
                    disabled={!canRun || running}
                  >
                    {running ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ejecutando…
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" /> Ejecutar ETL
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-lg font-semibold" style={{ color: "var(--platform-success)" }}>
                  <CheckCircle2 className="h-8 w-8" />
                  ETL en ejecución
                </div>
                <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                  Los datos se están procesando en segundo plano. Cuando termine, la tabla <strong style={{ color: "var(--platform-fg)" }}>{outputTableName}</strong> estará lista para usar en un dashboard.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="rounded-xl flex items-center gap-2"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => router.push(`/admin/dashboard?create=1&etlId=${etlId}`)}
                  >
                    <LayoutDashboard className="h-4 w-4" /> Crear dashboard con estos datos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => router.push("/admin/dashboard")}
                  >
                    Ver dashboards
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
