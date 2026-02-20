"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
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
  Sparkles,
  Link2,
} from "lucide-react";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";
import { toast } from "sonner";

const STEPS = [
  { id: "conexion", label: "Conexión", icon: Link2 },
  { id: "origen", label: "Origen", icon: Database },
  { id: "filtros", label: "Columnas y filtros", icon: Filter },
  { id: "transformacion", label: "Transformación", icon: Sparkles },
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

export type ETLGuidedFlowHandle = {
  goToEjecutar: () => void;
};

type Props = {
  etlId: string;
  connections: ServerConnection[];
  initialStep?: StepId;
};

const ETLGuidedFlowInner = forwardRef<ETLGuidedFlowHandle, Props>(function ETLGuidedFlowInner({ etlId, connections, initialStep = "conexion" }, ref) {
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

  // Transformación (limpieza y calidad) — mismo modelo que el nodo Clean del editor avanzado
  const [nullCleanup, setNullCleanup] = useState<{
    patterns: string[];
    action: "null" | "replace";
    replacement?: string;
    columns: string[];
  } | null>(null);
  const defaultNullPatterns = ["NA", "-", ".", ""];
  const [cleanTransforms, setCleanTransforms] = useState<Array<{ column: string; op: string; find?: string; replaceWith?: string }>>([]);
  const [dataFixes, setDataFixes] = useState<Array<{ column: string; find: string; replaceWith: string }>>([]);
  const [dedupe, setDedupe] = useState<{ keyColumns: string[]; keep: "first" | "last" } | null>(null);

  // UNION (opcional): segunda conexión + tabla + UNION ALL
  const [useUnion, setUseUnion] = useState(false);
  const [unionRightConnectionId, setUnionRightConnectionId] = useState<string | number | null>(null);
  const [unionRightTable, setUnionRightTable] = useState<string | null>(null);
  const [unionAll, setUnionAll] = useState(true);
  const [unionRightTables, setUnionRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [loadingUnionMeta, setLoadingUnionMeta] = useState(false);

  // JOIN (opcional): segunda conexión + tabla + tipo + columnas de enlace
  const [useJoin, setUseJoin] = useState(false);
  const [joinSecondaryConnectionId, setJoinSecondaryConnectionId] = useState<string | number | null>(null);
  const [joinSecondaryTable, setJoinSecondaryTable] = useState<string | null>(null);
  const [joinType, setJoinType] = useState<"INNER" | "LEFT" | "RIGHT" | "FULL">("INNER");
  const [joinLeftColumn, setJoinLeftColumn] = useState<string>("");
  const [joinRightColumn, setJoinRightColumn] = useState<string>("");
  const [joinRightTables, setJoinRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [joinRightColumns, setJoinRightColumns] = useState<string[]>([]);
  const [loadingJoinMeta, setLoadingJoinMeta] = useState(false);

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

  // Reset transformación al cambiar conexión o tabla
  useEffect(() => {
    setNullCleanup(null);
    setCleanTransforms([]);
    setDataFixes([]);
    setDedupe(null);
  }, [connectionId, selectedTable]);

  // Cargar tablas para UNION derecha
  useEffect(() => {
    if (!useUnion || !unionRightConnectionId) {
      setUnionRightTables([]);
      setUnionRightTable(null);
      return;
    }
    let cancelled = false;
    setLoadingUnionMeta(true);
    fetchMetadata(unionRightConnectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setUnionRightTables(data.metadata.tables || []);
        setUnionRightTable(null);
      })
      .finally(() => { if (!cancelled) setLoadingUnionMeta(false); });
    return () => { cancelled = true; };
  }, [useUnion, unionRightConnectionId]);

  // Cargar tablas para JOIN secundaria
  useEffect(() => {
    if (!useJoin || !joinSecondaryConnectionId) {
      setJoinRightTables([]);
      setJoinSecondaryTable(null);
      setJoinRightColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingJoinMeta(true);
    fetchMetadata(joinSecondaryConnectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setJoinRightTables(data.metadata.tables || []);
        setJoinSecondaryTable(null);
        setJoinRightColumns([]);
      })
      .finally(() => { if (!cancelled) setLoadingJoinMeta(false); });
    return () => { cancelled = true; };
  }, [useJoin, joinSecondaryConnectionId]);

  // Columnas de la tabla secundaria del JOIN
  const joinRightTableInfo = joinRightTables.find((t) => `${t.schema}.${t.name}` === joinSecondaryTable);
  useEffect(() => {
    if (!joinSecondaryTable || !joinSecondaryConnectionId) {
      setJoinRightColumns([]);
      return;
    }
    if (joinRightTableInfo?.columns?.length) {
      setJoinRightColumns(joinRightTableInfo.columns.map((c) => c.name));
      return;
    }
    // Pedir columnas si la tabla no las trae
    fetchMetadata(joinSecondaryConnectionId, joinSecondaryTable)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok || !data.metadata?.tables?.[0]?.columns) return;
        const cols = data.metadata.tables[0].columns.map((c: { name: string }) => c.name);
        setJoinRightTables((prev) =>
          prev.map((t) =>
            `${t.schema}.${t.name}` === joinSecondaryTable ? { ...t, columns: data.metadata.tables[0].columns } : t
          )
        );
        setJoinRightColumns(cols);
      });
  }, [joinSecondaryTable, joinSecondaryConnectionId, joinRightTableInfo?.columns]);

  const canRun =
    connectionId &&
    selectedTable &&
    outputTableName.trim().length > 0 &&
    /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  // Construir config de limpieza para la API (mismo formato que el editor avanzado)
  const buildCleanConfig = useCallback(() => {
    const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
    const transforms: Array<{ column: string; op: string; find?: string; replaceWith?: string; patterns?: string[]; action?: "null" | "replace"; replacement?: string }> = [];
    if (nullCleanup?.columns?.length) {
      nullCleanup.columns.forEach((col) => {
        transforms.push({ column: col, op: "normalize_nulls", patterns: nullCleanup.patterns, action: nullCleanup.action, replacement: nullCleanup.replacement });
      });
    }
    cleanTransforms.forEach((t) => transforms.push(t));
    dataFixes.forEach((f) => transforms.push({ column: f.column, op: "replace_value", find: f.find, replaceWith: f.replaceWith }));
    if (transforms.length === 0 && !dedupe?.keyColumns?.length) return undefined;
    return { transforms, dedupe: dedupe ?? undefined };
  }, [nullCleanup, cleanTransforms, dataFixes, dedupe, columns, selectedTableInfo?.columns]);

  const handleRun = async () => {
    if (!canRun || !connectionId || !selectedTable) return;
    setRunning(true);
    const cleanConfig = buildCleanConfig();
    const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);

    try {
      let body: Record<string, unknown> = {
        etlId,
        end: {
          target: { type: "supabase", table: outputTableName.trim() },
          mode: outputMode,
        },
      };

      if (useUnion && unionRightConnectionId && unionRightTable) {
        body.union = {
          left: {
            connectionId,
            filter: {
              table: selectedTable,
              columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
              conditions: conditions.length > 0 ? conditions : [],
            },
          },
          right: {
            connectionId: unionRightConnectionId,
            filter: {
              table: unionRightTable,
              columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
              conditions: [],
            },
          },
          unionAll,
        };
      } else if (useJoin && joinSecondaryConnectionId && joinSecondaryTable && joinLeftColumn && joinRightColumn) {
        body.connectionId = connectionId;
        body.filter = {
          table: selectedTable,
          columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
          conditions: conditions.length > 0 ? conditions : [],
        };
        body.join = {
          connectionId,
          secondaryConnectionId: joinSecondaryConnectionId,
          leftTable: selectedTable,
          rightTable: joinSecondaryTable,
          joinConditions: [
            {
              leftTable: selectedTable,
              leftColumn: joinLeftColumn,
              rightTable: joinSecondaryTable,
              rightColumn: joinRightColumn,
              joinType,
            },
          ],
          leftColumns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
          rightColumns: joinRightColumns.length > 0 ? joinRightColumns : undefined,
        };
      } else {
        body.connectionId = connectionId;
        body.filter = {
          table: selectedTable,
          columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
          conditions: conditions.length > 0 ? conditions : [],
        };
      }

      if (cleanConfig) body.clean = cleanConfig;

      const res = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  useImperativeHandle(ref, () => ({
    goToEjecutar: () => setStep("ejecutar"),
  }), []);

  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;
  const canGoNextConexion = !!connectionId;
  const canGoNextOrigen = !!connectionId && !!selectedTable;
  const canGoNextDestino = outputTableName.trim().length > 0 && /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());
  const destinoInvalid = outputTableName.trim().length > 0 && !/^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden" style={{ background: "var(--platform-surface)", border: "1px solid var(--platform-border)" }}>
      {/* Stepper con progreso */}
      <div className="shrink-0 border-b" style={{ borderColor: "var(--platform-border)" }}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>
            <span>Paso {stepIndex + 1} de {STEPS.length}</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--platform-surface-hover)" }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: "var(--platform-accent)" }} />
          </div>
        </div>
        <div className="flex items-center gap-1 p-2 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isPast = stepIndex > i;
            const canJump = isPast || isActive;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => !runSuccess && canJump && setStep(s.id)}
                disabled={runSuccess || (!isPast && !isActive)}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isActive ? "var(--platform-accent-dim)" : "transparent",
                  color: isActive ? "var(--platform-accent)" : isPast ? "var(--platform-fg)" : "var(--platform-fg-muted)",
                }}
                title={`Paso ${i + 1}: ${s.label}`}
              >
                <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isActive ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: isActive ? "var(--platform-bg)" : "inherit" }}>
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {step === "conexion" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                1. Conexión
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí la conexión a la base de datos de origen (PostgreSQL, MySQL, etc.). Si aún no tenés una, creala primero.
              </p>
            </div>
            {connections.length === 0 ? (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <Link2 className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>No hay conexiones disponibles</p>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>Creá una conexión a tu base de datos para poder continuar con el ETL.</p>
                <Button
                  type="button"
                  className="rounded-xl mt-4"
                  style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                  onClick={() => router.push("/admin/connections")}
                >
                  Crear conexión
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Conexión</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Base de datos de origen</p>
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
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => setStep("origen")}
                    disabled={!canGoNextConexion}
                  >
                    Siguiente: Origen <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => router.push("/admin/connections")}
                  >
                    Gestionar conexiones
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "origen" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                2. Origen de datos
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí la tabla de donde se leerán los datos.
              </p>
            </div>
            {connections.length === 0 ? (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <Database className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>No hay conexiones disponibles</p>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>En el paso anterior elegí una conexión o creá una desde el panel de conexiones.</p>
                <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("conexion")}>
                  Ir a Conexión
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Conexión</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Base de datos de origen (PostgreSQL, MySQL, etc.)</p>
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
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Tabla</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Tabla que contiene los datos a extraer</p>
                  {loadingMeta ? (
                    <div className="mt-2 flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
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
                      <option value="">{connectionId && tables.length === 0 ? "No hay tablas" : "Seleccionar tabla…"}</option>
                      {tables.map((t) => (
                        <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                          {t.schema}.{t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("conexion")}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => setStep("filtros")}
                    disabled={!canGoNextOrigen}
                  >
                    Siguiente: Columnas y filtros <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "transformacion" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                4. Transformación (opcional)
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Limpiá nulos, normalizá texto, corregí valores fijos y eliminá duplicados antes de guardar.
              </p>
            </div>
            {(() => {
              const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
              if (effectiveColumns.length === 0) {
                return (
                  <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Sin columnas para transformar</p>
                    <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>En el paso anterior elegí al menos una columna o dejá todas para poder configurar transformaciones aquí.</p>
                    <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("filtros")}>
                      Ir a Columnas y filtros
                    </Button>
                  </div>
                );
              }
              return (
                <div className="space-y-6">
                  {/* Valores nulos o vacíos */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Valores nulos o vacíos</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Valores a considerar vacíos (separados por coma).</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        placeholder="NA, -, ., (vacío)"
                        value={nullCleanup?.patterns?.join(", ") ?? defaultNullPatterns.join(", ")}
                        onChange={(e) => {
                          const patterns = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          setNullCleanup({
                            patterns: patterns.length ? patterns : defaultNullPatterns,
                            action: nullCleanup?.action ?? "null",
                            replacement: nullCleanup?.replacement,
                            columns: effectiveColumns,
                          });
                        }}
                      />
                      <select
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        value={nullCleanup?.action ?? "null"}
                        onChange={(e) => setNullCleanup((prev) => prev ? { ...prev, action: e.target.value as "null" | "replace" } : { patterns: defaultNullPatterns, action: e.target.value as "null" | "replace", replacement: undefined, columns: effectiveColumns })}
                      >
                        <option value="null">Convertir a NULL</option>
                        <option value="replace">Reemplazar por valor</option>
                      </select>
                      {nullCleanup?.action === "replace" && (
                        <input
                          type="text"
                          className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                          placeholder="Valor"
                          value={nullCleanup?.replacement ?? ""}
                          onChange={(e) => setNullCleanup((prev) => prev ? { ...prev, replacement: e.target.value || undefined } : null)}
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setNullCleanup({ patterns: nullCleanup?.patterns ?? defaultNullPatterns, action: nullCleanup?.action ?? "null", replacement: nullCleanup?.replacement, columns: effectiveColumns })}
                    >
                      Activar en todas las columnas
                    </Button>
                  </div>

                  {/* Normalización de texto por columna */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Normalización de texto por columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Elegí una operación por columna (opcional).</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {effectiveColumns.map((colName) => {
                        const t = cleanTransforms.find((t) => t.column === colName);
                        const op = t?.op ?? "";
                        return (
                          <div key={colName} className="flex gap-2 items-center flex-wrap">
                            <span className="text-sm w-32 truncate" style={{ color: "var(--platform-fg-muted)" }}>{colName}</span>
                            <select
                              className="rounded-lg border px-2 py-1.5 text-sm flex-1 min-w-[140px]"
                              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                              value={op}
                              onChange={(e) => {
                                const newOp = e.target.value;
                                setCleanTransforms((prev) => {
                                  const rest = prev.filter((x) => x.column !== colName);
                                  if (!newOp) return rest;
                                  if (newOp === "replace") return [...rest, { column: colName, op: "replace", find: "", replaceWith: "" }];
                                  return [...rest, { column: colName, op: newOp }];
                                });
                              }}
                            >
                              <option value="">(ninguna)</option>
                              <option value="trim">Recortar espacios</option>
                              <option value="upper">Mayúsculas</option>
                              <option value="lower">Minúsculas</option>
                              <option value="normalize_spaces">Espacios múltiples → uno</option>
                              <option value="strip_invisible">Quitar caracteres invisibles</option>
                              <option value="utf8_normalize">Normalizar UTF-8</option>
                            </select>
                            {op === "replace" && (
                              <>
                                <input
                                  type="text"
                                  className="rounded border px-1.5 py-1 text-xs w-24"
                                  placeholder="Buscar"
                                  value={t?.find ?? ""}
                                  onChange={(ev) =>
                                    setCleanTransforms((prev) =>
                                      prev.map((x) =>
                                        x.column === colName && x.op === "replace"
                                          ? { ...x, find: ev.target.value }
                                          : x
                                      )
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  className="rounded border px-1.5 py-1 text-xs w-24"
                                  placeholder="Reemplazar"
                                  value={t?.replaceWith ?? ""}
                                  onChange={(ev) =>
                                    setCleanTransforms((prev) =>
                                      prev.map((x) =>
                                        x.column === colName && x.op === "replace"
                                          ? { ...x, replaceWith: ev.target.value }
                                          : x
                                      )
                                    )
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Correcciones permanentes */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Correcciones permanentes</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Reemplazar valor incorrecto → correcto (coincidencia exacta).</p>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {dataFixes.map((fix, idx) => (
                        <div key={idx} className="flex gap-2 items-center flex-wrap">
                          <select
                            className="rounded border px-2 py-1 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={fix.column}
                            onChange={(e) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, column: e.target.value }; return n; })}
                          >
                            {effectiveColumns.map((c) => (<option key={c} value={c}>{c}</option>))}
                          </select>
                          <input type="text" className="rounded border px-2 py-1 text-sm w-28" placeholder="Incorrecto" value={fix.find} onChange={(e) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, find: e.target.value }; return n; })} />
                          <span style={{ color: "var(--platform-fg-muted)" }}>→</span>
                          <input type="text" className="rounded border px-2 py-1 text-sm w-28" placeholder="Correcto" value={fix.replaceWith} onChange={(e) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, replaceWith: e.target.value }; return n; })} />
                          <button type="button" className="text-red-500 hover:bg-red-50 rounded p-1" onClick={() => setDataFixes((prev) => prev.filter((_, i) => i !== idx))}>×</button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => setDataFixes((prev) => [...prev, { column: effectiveColumns[0] ?? "", find: "", replaceWith: "" }])}>
                      + Añadir corrección
                    </Button>
                  </div>

                  {/* Duplicados */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Duplicados</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas clave para identificar duplicados. Se conserva una fila por clave.</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        value="__add__"
                        onChange={(e) => {
                          const col = e.target.value;
                          if (col === "__add__") return;
                          setDedupe((prev) => ({ keyColumns: [...(prev?.keyColumns ?? []), col], keep: prev?.keep ?? "first" }));
                        }}
                      >
                        <option value="__add__">Añadir columna clave</option>
                        {effectiveColumns.filter((c) => !dedupe?.keyColumns.includes(c)).map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                      <select
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        value={dedupe?.keep ?? "first"}
                        onChange={(e) => setDedupe((prev) => ({ keyColumns: prev?.keyColumns ?? [], keep: e.target.value as "first" | "last" }))}
                      >
                        <option value="first">Mantener primera</option>
                        <option value="last">Mantener última</option>
                      </select>
                    </div>
                    {dedupe?.keyColumns?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {dedupe.keyColumns.map((col) => (
                          <span key={col} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}>
                            {col}
                            <button type="button" className="hover:opacity-70" onClick={() => setDedupe((prev) => prev ? { ...prev, keyColumns: prev.keyColumns.filter((c) => c !== col) } : null)}>×</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* UNION (opcional) */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="use-union"
                        checked={useUnion}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setUseUnion(v);
                          if (v) setUseJoin(false);
                          if (!v) { setUnionRightConnectionId(null); setUnionRightTable(null); }
                        }}
                      />
                      <Label htmlFor="use-union" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (UNION)</Label>
                    </div>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Apilar filas de otra tabla con las mismas columnas. Ambas tablas deben tener la misma estructura.</p>
                    {useUnion && (
                      <div className="flex flex-wrap gap-2 items-center pt-2">
                        <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Segunda conexión</Label>
                        <select
                          className="rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                          value={unionRightConnectionId ?? ""}
                          onChange={(e) => setUnionRightConnectionId(e.target.value ? e.target.value : null)}
                        >
                          <option value="">Elegir conexión</option>
                          {connections.map((c) => (
                            <option key={c.id} value={c.id}>{c.title}{String(c.id) === String(connectionId) ? " (principal)" : ""}</option>
                          ))}
                        </select>
                        <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Segunda tabla</Label>
                        <select
                          className="rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                          value={unionRightTable ?? ""}
                          onChange={(e) => setUnionRightTable(e.target.value || null)}
                          disabled={!unionRightConnectionId || loadingUnionMeta}
                        >
                          <option value="">Elegir tabla</option>
                          {unionRightTables.map((t) => (
                            <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>{t.schema}.{t.name}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                          <input type="checkbox" checked={unionAll} onChange={(e) => setUnionAll(e.target.checked)} />
                          UNION ALL (incluir duplicados)
                        </label>
                      </div>
                    )}
                  </div>

                  {/* JOIN (opcional) */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="use-join"
                        checked={useJoin}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setUseJoin(v);
                          if (v) setUseUnion(false);
                          if (!v) { setJoinSecondaryConnectionId(null); setJoinSecondaryTable(null); setJoinLeftColumn(""); setJoinRightColumn(""); }
                        }}
                      />
                      <Label htmlFor="use-join" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (JOIN)</Label>
                    </div>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Unir por una columna en común. Elegí la tabla secundaria y las columnas de enlace.</p>
                    {useJoin && (
                      <div className="space-y-2 pt-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Segunda conexión</Label>
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinSecondaryConnectionId ?? ""}
                            onChange={(e) => { setJoinSecondaryConnectionId(e.target.value ? e.target.value : null); setJoinSecondaryTable(null); setJoinLeftColumn(""); setJoinRightColumn(""); }}
                          >
                            <option value="">Elegir conexión</option>
                            {connections.map((c) => (
                              <option key={c.id} value={c.id}>{c.title}{String(c.id) === String(connectionId) ? " (principal)" : ""}</option>
                            ))}
                          </select>
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Segunda tabla</Label>
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinSecondaryTable ?? ""}
                            onChange={(e) => { setJoinSecondaryTable(e.target.value || null); setJoinRightColumn(""); }}
                            disabled={!joinSecondaryConnectionId || loadingJoinMeta}
                          >
                            <option value="">Elegir tabla</option>
                            {joinRightTables.map((t) => (
                              <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>{t.schema}.{t.name}</option>
                            ))}
                          </select>
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Tipo</Label>
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinType}
                            onChange={(e) => setJoinType(e.target.value as "INNER" | "LEFT" | "RIGHT" | "FULL")}
                          >
                            <option value="INNER">INNER</option>
                            <option value="LEFT">LEFT</option>
                            <option value="RIGHT">RIGHT</option>
                            <option value="FULL">FULL</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna tabla principal</Label>
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinLeftColumn}
                            onChange={(e) => setJoinLeftColumn(e.target.value)}
                          >
                            <option value="">Elegir columna</option>
                            {effectiveColumns.map((c) => (<option key={c} value={c}>{c}</option>))}
                          </select>
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna tabla secundaria</Label>
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinRightColumn}
                            onChange={(e) => setJoinRightColumn(e.target.value)}
                          >
                            <option value="">Elegir columna</option>
                            {joinRightColumns.map((c) => (<option key={c} value={c}>{c}</option>))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("filtros")}>
                Atrás
              </Button>
              <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={() => setStep("destino")}>
                Siguiente: Destino <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "filtros" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                3. Columnas y filtros (opcional)
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí qué columnas incluir. Si no elegís ninguna, se usan todas.
              </p>
            </div>
            {loadingColumns === selectedTable ? (
              <div className="flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando columnas…
              </div>
            ) : (selectedTableInfo?.columns?.length ?? 0) > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Columnas a incluir</Label>
                  <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}>
                    {columns.length === 0 ? "Todas" : `${columns.length} seleccionadas`}
                  </span>
                </div>
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
                onClick={() => setStep("transformacion")}
              >
                Siguiente: Transformación <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "destino" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                5. Tabla de destino
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Nombre de la tabla en Supabase donde se guardarán los datos. Solo letras, números y guión bajo. El dashboard usará esta tabla.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Nombre de la tabla</Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Ej: ventas_2025, reporte_mensual</p>
              <Input
                value={outputTableName}
                onChange={(e) => setOutputTableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
                placeholder="ej. ventas_2025"
                className="mt-2 rounded-xl"
                style={{
                  background: "var(--platform-bg)",
                  borderColor: destinoInvalid ? "var(--platform-error, #dc2626)" : "var(--platform-border)",
                  color: "var(--platform-fg)",
                }}
              />
              {destinoInvalid && (
                <p className="text-xs mt-1" style={{ color: "var(--platform-error, #dc2626)" }}>Solo se permiten letras, números y guión bajo.</p>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Modo al escribir</Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Sobrescribir reemplaza toda la tabla; Agregar añade filas sin borrar.</p>
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
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("transformacion")}>
                Atrás
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                onClick={() => setStep("ejecutar")}
                disabled={!canGoNextDestino}
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
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                    6. Resumen y ejecución
                  </h3>
                  <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                    Revisá la configuración y ejecutá el ETL para cargar los datos en Supabase.
                  </p>
                </div>
                {!canRun && (
                  <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: "var(--platform-error, #dc2626)", background: "rgba(220, 38, 38, 0.06)" }}>
                    <span className="text-lg" style={{ color: "var(--platform-error, #dc2626)" }}>!</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Falta configurar</p>
                      <p className="text-sm mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                        {!outputTableName.trim() ? "Indicá un nombre para la tabla de destino." : "El nombre de la tabla solo puede tener letras, números y guión bajo."}
                      </p>
                      <Button type="button" variant="outline" size="sm" className="rounded-lg mt-2" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("destino")}>
                        Ir a Destino
                      </Button>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border divide-y" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Database className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Origen</p>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{connectionName} → {selectedTable ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Table className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Destino</p>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{outputTableName || "—"} · {outputMode === "overwrite" ? "Sobrescribir" : "Agregar"}</p>
                    </div>
                  </div>
                  {(buildCleanConfig() || (useUnion && unionRightTable) || (useJoin && joinSecondaryTable)) && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Sparkles className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                      <div>
                        <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Transformación</p>
                        <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                          {useUnion && unionRightTable && `UNION con ${unionRightTable}${unionAll ? " (ALL)" : ""}${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {useJoin && joinSecondaryTable && !useUnion && `JOIN ${joinType} con ${joinSecondaryTable}${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {!useUnion && !useJoin && buildCleanConfig() && "Limpieza de nulos, texto, correcciones y/o duplicados"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("destino")}>
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
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: "var(--platform-success)", color: "white" }}>
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                  ETL en ejecución
                </h3>
                <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--platform-fg-muted)" }}>
                  Los datos se están procesando en segundo plano. Cuando termine, la tabla <strong style={{ color: "var(--platform-fg)" }}>{outputTableName}</strong> estará lista para usar en un dashboard.
                </p>
                <div className="flex flex-wrap gap-3 justify-center mt-6">
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
});

export default ETLGuidedFlowInner;
