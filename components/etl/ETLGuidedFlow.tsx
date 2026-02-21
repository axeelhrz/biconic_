"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
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
  /** Devuelve la configuración actual del flujo (mismo formato que se envía al ejecutar) */
  getGuidedConfig: () => Record<string, unknown> | null;
  /** Guarda la configuración actual en el ETL (layout.guided_config) */
  saveGuidedConfig: () => Promise<boolean>;
  /** Indica si se puede ejecutar el ETL (conexión, tabla, columnas, destino válido) */
  getCanRun: () => boolean;
  /** Ejecuta el ETL si la configuración es válida (mismo efecto que el botón "Ejecutar ETL") */
  run: () => void;
};

/** Configuración guardada al ejecutar (layout.guided_config) para cargar al editar */
export type GuidedConfig = {
  connectionId?: string | number | null;
  filter?: {
    table?: string;
    columns?: string[];
    conditions?: Array<{ column: string; operator: string; value?: string }>;
    /** Columna usada en "Excluir filas" para cargar valores y marcar excluidos */
    excludeRowsColumn?: string;
  };
  union?: {
    left?: { connectionId?: string | number; filter?: { table?: string; columns?: string[]; conditions?: unknown[] } };
    rights?: Array<{ connectionId: string | number; filter?: { table?: string; columns?: string[] } }>;
    right?: { connectionId: string | number; filter?: { table?: string; columns?: string[] } };
    unionAll?: boolean;
  };
  join?: {
    primaryConnectionId?: string | number;
    primaryTable?: string;
    joins?: Array<{
      id?: string;
      secondaryConnectionId?: string | number;
      secondaryTable?: string;
      joinType?: "INNER" | "LEFT" | "RIGHT" | "FULL";
      primaryColumn?: string;
      secondaryColumn?: string;
      secondaryColumns?: string[];
    }>;
  };
  clean?: {
    transforms?: Array<{ column: string; op: string; find?: string; replaceWith?: string; patterns?: string[]; action?: string; replacement?: string }>;
    dedupe?: { keyColumns?: string[]; keep?: "first" | "last" };
  };
  end?: { target?: { table?: string }; mode?: "overwrite" | "append" };
};

type Props = {
  etlId: string;
  connections: ServerConnection[];
  initialStep?: StepId;
  /** Si existe, se usa para inicializar todo el estado del flujo (al editar un ETL ya configurado) */
  initialGuidedConfig?: GuidedConfig | null;
  /** En true, siempre muestra el editor (todas las secciones en una página). Usado en /admin/etl/[id]/edit */
  forceEditorMode?: boolean;
};

const ETLGuidedFlowInner = forwardRef<ETLGuidedFlowHandle, Props>(function ETLGuidedFlowInner({ etlId, connections, initialStep = "conexion", initialGuidedConfig, forceEditorMode }, ref) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(initialStep);
  const [connectionId, setConnectionId] = useState<string | number | null>(null);
  const [tables, setTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Array<{ column: string; operator: string; value?: string }>>([]);
  /** Excluir filas por valores: por cada columna, lista de valores a excluir (NOT IN) */
  const [excludedValues, setExcludedValues] = useState<Array<{ column: string; excluded: string[] }>>([]);
  const [distinctColumn, setDistinctColumn] = useState<string | null>(null);
  const [distinctValuesList, setDistinctValuesList] = useState<string[]>([]);
  const [loadingDistinct, setLoadingDistinct] = useState(false);
  const [distinctSearch, setDistinctSearch] = useState("");
  const [outputTableName, setOutputTableName] = useState("");
  const [outputMode, setOutputMode] = useState<"overwrite" | "append">("overwrite");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState<string | null>(null);
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

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

  // UNION (opcional): múltiples tablas a apilar + columnas por tabla
  const [useUnion, setUseUnion] = useState(false);
  const [unionRightConnectionId, setUnionRightConnectionId] = useState<string | number | null>(null);
  const [unionRightTable, setUnionRightTable] = useState<string | null>(null);
  const [unionAll, setUnionAll] = useState(true);
  const [unionRightTables, setUnionRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [loadingUnionMeta, setLoadingUnionMeta] = useState(false);
  const [unionTableSearch, setUnionTableSearch] = useState("");
  /** Lista de tablas añadidas para UNION: cada una con connectionId, table y columnas a traer */
  const [unionRightItems, setUnionRightItems] = useState<Array<{ connectionId: string | number; table: string; columns: string[]; availableColumns?: { name: string }[] }>>([]);

  // JOIN (opcional): múltiples tablas + columnas por tabla
  const [useJoin, setUseJoin] = useState(false);
  const [joinSecondaryConnectionId, setJoinSecondaryConnectionId] = useState<string | number | null>(null);
  const [joinSecondaryTable, setJoinSecondaryTable] = useState<string | null>(null);
  const [joinType, setJoinType] = useState<"INNER" | "LEFT" | "RIGHT" | "FULL">("INNER");
  const [joinLeftColumn, setJoinLeftColumn] = useState<string>("");
  const [joinRightColumn, setJoinRightColumn] = useState<string>("");
  const [joinRightTables, setJoinRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [joinRightColumns, setJoinRightColumns] = useState<string[]>([]);
  const [loadingJoinMeta, setLoadingJoinMeta] = useState(false);
  const [joinTableSearch, setJoinTableSearch] = useState("");
  /** Lista de tablas añadidas para JOIN: cada una con connectionId, table, joinType, leftColumn, rightColumn, rightColumns */
  const [joinItems, setJoinItems] = useState<Array<{
    id: string;
    connectionId: string | number;
    table: string;
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
    leftColumn: string;
    rightColumn: string;
    rightColumns: string[];
    availableColumns?: { name: string }[];
  }>>([]);

  const skipClearSelectedTableRef = useRef(false);
  const restoringFromConfigRef = useRef(false);
  const tableSelectRef = useRef<HTMLSelectElement>(null);
  const distinctLoadFromConfigRef = useRef(false);

  // Restaurar estado desde configuración guardada (al editar un ETL ya ejecutado)
  useEffect(() => {
    const cfg = initialGuidedConfig as GuidedConfig | undefined | null;
    restoringFromConfigRef.current = true;
    if (!cfg || typeof cfg !== "object") return;
    const connId = cfg.connectionId ?? (cfg.union?.left as { connectionId?: string | number })?.connectionId ?? (cfg.join as { primaryConnectionId?: string | number })?.primaryConnectionId;
    if (connId != null && typeof connId !== "object") setConnectionId(connId);
    const filter = cfg.filter;
    if (filter?.table != null && String(filter.table).trim() !== "") {
      skipClearSelectedTableRef.current = true;
      setSelectedTable(String(filter.table).trim());
    }
    const cols = filter?.columns;
    if (Array.isArray(cols) && cols.length > 0) {
      const primaryCols = cols.filter((c: string) => c.startsWith("primary.")).map((c: string) => c.replace(/^primary\./, ""));
      setColumns(primaryCols.length > 0 ? primaryCols : cols);
    }
    const conds = filter?.conditions ?? [];
    const notInConds = conds.filter((c: { operator?: string }) => c.operator === "not in");
    const restConds = conds.filter((c: { operator?: string }) => c.operator !== "not in");
    if (restConds.length > 0) setConditions(restConds);
    if (notInConds.length > 0) setExcludedValues(notInConds.map((c: { column: string; value?: string }) => ({ column: c.column, excluded: (c.value ?? "").split(",").filter(Boolean) })));
    const excludeRowsCol = (filter as { excludeRowsColumn?: string })?.excludeRowsColumn ?? notInConds[0]?.column;
    if (excludeRowsCol && typeof excludeRowsCol === "string") setDistinctColumn(excludeRowsCol.trim());
    const end = cfg.end;
    if (end?.target?.table) setOutputTableName(end.target.table);
    if (end?.mode) setOutputMode(end.mode);
    const union = cfg.union;
    if (union) {
      setUseUnion(true);
      setUnionAll(union.unionAll !== false);
      const rights = union.rights ?? (union.right ? [union.right] : []);
      setUnionRightItems(rights.map((r: { connectionId: string | number; filter?: { table?: string; columns?: string[] } }) => ({
        connectionId: r.connectionId,
        table: r.filter?.table ?? "",
        columns: r.filter?.columns ?? [],
      })));
    }
    const join = cfg.join;
    if (join?.joins?.length) {
      setUseJoin(true);
      setJoinItems(join.joins.map((j: any, i: number) => ({
        id: j.id ?? `join_${i}_${Date.now()}`,
        connectionId: j.secondaryConnectionId,
        table: j.secondaryTable ?? "",
        joinType: (j.joinType ?? "INNER") as "INNER" | "LEFT" | "RIGHT" | "FULL",
        leftColumn: j.primaryColumn ?? "",
        rightColumn: j.secondaryColumn ?? "",
        rightColumns: j.secondaryColumns ?? [],
      })));
    }
    const clean = cfg.clean;
    if (clean) {
      const transforms = clean.transforms ?? [];
      const nullNorms = transforms.filter((t: { op?: string }) => t.op === "normalize_nulls");
      if (nullNorms.length > 0) {
        const first = nullNorms[0] as any;
        setNullCleanup({
          patterns: first.patterns ?? [],
          action: (first.action === "replace" ? "replace" : "null") as "null" | "replace",
          replacement: first.replacement,
          columns: nullNorms.map((t: any) => t.column).filter(Boolean),
        });
      }
      setCleanTransforms(transforms.filter((t: { op?: string }) => t.op && !["normalize_nulls", "replace_value"].includes(t.op)).map((t: any) => ({ column: t.column, op: t.op, find: t.find, replaceWith: t.replaceWith })));
      setDataFixes(transforms.filter((t: { op?: string }) => t.op === "replace_value").map((t: any) => ({ column: t.column, find: t.find ?? "", replaceWith: t.replaceWith ?? "" })));
      if (clean.dedupe?.keyColumns?.length) setDedupe({ keyColumns: clean.dedupe.keyColumns, keep: clean.dedupe.keep ?? "first" });
    }
    queueMicrotask(() => {
      restoringFromConfigRef.current = false;
    });
  }, [initialGuidedConfig]);

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
        if (!skipClearSelectedTableRef.current) {
          setSelectedTable(null);
          setColumns([]);
        } else {
          skipClearSelectedTableRef.current = false;
        }
        setTableSearchQuery("");
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

  // Normalizar selectedTable cuando viene de config guardada: si la lista de tablas usa otro casing (ej. public.clientes vs PUBLIC.CLIENTES), usar la clave real para que el <select> muestre la tabla y selectedTableInfo exista
  useEffect(() => {
    if (!selectedTable || tables.length === 0 || selectedTableInfo) return;
    const normalized = tables.find(
      (t) => `${t.schema}.${t.name}`.toLowerCase() === selectedTable.toLowerCase()
    );
    if (normalized) setSelectedTable(`${normalized.schema}.${normalized.name}`);
  }, [tables, selectedTable, selectedTableInfo]);

  // Auto-cargar valores de "Excluir filas" cuando se restaura la config (columna + excluidos guardados) para no tener que pulsar "Cargar valores"
  useEffect(() => {
    const cfg = initialGuidedConfig as GuidedConfig | undefined | null;
    if (!cfg?.filter || distinctLoadFromConfigRef.current) return;
    const f = cfg.filter as { excludeRowsColumn?: string; conditions?: Array<{ operator?: string }> };
    const hasExclude = f.excludeRowsColumn || (Array.isArray(f.conditions) && f.conditions.some((c) => c.operator === "not in"));
    if (!hasExclude || !distinctColumn || !connectionId || !selectedTable) return;
    if (distinctValuesList.length > 0 || loadingDistinct) return;
    distinctLoadFromConfigRef.current = true;
    setLoadingDistinct(true);
    fetch("/api/connection/distinct-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, table: selectedTable, column: distinctColumn }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.values)) setDistinctValuesList(data.values);
      })
      .finally(() => setLoadingDistinct(false));
  }, [initialGuidedConfig, distinctColumn, connectionId, selectedTable, distinctValuesList.length, loadingDistinct]);

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

  // Reset transformación al cambiar conexión o tabla (no cuando acabamos de restaurar desde config)
  useEffect(() => {
    if (restoringFromConfigRef.current) return;
    setNullCleanup(null);
    setCleanTransforms([]);
    setDataFixes([]);
    setDedupe(null);
  }, [connectionId, selectedTable]);

  // Reset excluir por valores al cambiar tabla (no cuando acabamos de restaurar desde config)
  useEffect(() => {
    if (restoringFromConfigRef.current) return;
    setExcludedValues([]);
    setDistinctColumn(null);
    setDistinctValuesList([]);
    setDistinctSearch("");
  }, [connectionId, selectedTable]);

  // Cargar availableColumns para ítems de UNION/JOIN restaurados (al editar)
  useEffect(() => {
    const loadUnionItemColumns = async (item: { connectionId: string | number; table: string; columns: string[]; availableColumns?: { name: string }[] }, index: number) => {
      if (item.availableColumns?.length) return;
      try {
        const res = await fetchMetadata(item.connectionId, item.table);
        const data = await res.json();
        const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
        setUnionRightItems((prev) =>
          prev.map((it, i) => (i === index ? { ...it, availableColumns: colNames.map((n: string) => ({ name: n })) } : it))
        );
      } catch {
        // ignore
      }
    };
    unionRightItems.forEach((item, i) => {
      if (item.table && (!item.availableColumns || item.availableColumns.length === 0)) loadUnionItemColumns(item, i);
    });
  }, [unionRightItems]);

  useEffect(() => {
    const loadJoinItemColumns = async (item: { id: string; connectionId: string | number; table: string; rightColumns: string[]; availableColumns?: { name: string }[] }, index: number) => {
      if (item.availableColumns?.length) return;
      try {
        const res = await fetchMetadata(item.connectionId, item.table);
        const data = await res.json();
        const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
        setJoinItems((prev) =>
          prev.map((it, i) => (i === index ? { ...it, availableColumns: colNames.map((n: string) => ({ name: n })) } : it))
        );
      } catch {
        // ignore
      }
    };
    joinItems.forEach((item, i) => {
      if (item.table && (!item.availableColumns || item.availableColumns.length === 0)) loadJoinItemColumns(item, i);
    });
  }, [joinItems]);

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

  const hasColumnsToRun =
    columns.length > 0 || (selectedTableInfo?.columns?.length ?? 0) > 0;
  const canRun =
    !!connectionId &&
    !!selectedTable &&
    hasColumnsToRun &&
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

  const allFilterConditions = useCallback(() => {
    const fromExcluded = excludedValues.flatMap(({ column, excluded }) =>
      excluded.length ? [{ column, operator: "not in" as const, value: excluded.join(",") }] : []
    );
    return [...conditions, ...fromExcluded];
  }, [conditions, excludedValues]);

  /** Construye el objeto guided_config (connectionId, filter, union, join, clean, end) para guardar o ejecutar. Permite parcial (solo conexión) para que al guardar quede algo persistido. */
  const buildGuidedConfigBody = useCallback((): Record<string, unknown> | null => {
    if (!connectionId) return null;
    const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
    const filterConditions = allFilterConditions();
    const cleanConfig = buildCleanConfig();
    const tableName = selectedTable || undefined;
    const filterPayload: Record<string, unknown> = {
      table: tableName,
      columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
      conditions: filterConditions.length > 0 ? filterConditions : [],
    };
    if (distinctColumn) filterPayload.excludeRowsColumn = distinctColumn;
    let body: Record<string, unknown> = {
      connectionId,
      filter: filterPayload,
      end: {
        target: { type: "supabase", table: (outputTableName || "").trim() || undefined },
        mode: outputMode,
      },
    };
    if (useUnion && unionRightItems.length > 0) {
      body.union = {
        left: { connectionId, filter: { table: selectedTable, columns: effectiveColumns.length > 0 ? effectiveColumns : undefined, conditions: filterConditions } },
        rights: unionRightItems.map((item) => ({
          connectionId: item.connectionId,
          filter: { table: item.table, columns: item.columns.length > 0 ? item.columns : undefined, conditions: [] },
        })),
        unionAll,
      };
    } else if (useJoin) {
      const effectiveJoinItems = joinItems.length > 0
        ? joinItems
        : joinSecondaryConnectionId && joinSecondaryTable && joinLeftColumn && joinRightColumn
          ? [{ id: "join_0", connectionId: joinSecondaryConnectionId, table: joinSecondaryTable, joinType, leftColumn: joinLeftColumn, rightColumn: joinRightColumn, rightColumns: joinRightColumns }]
          : [];
      if (effectiveJoinItems.length > 0) {
        body.connectionId = connectionId;
        body.filter = {
          ...filterPayload,
          table: selectedTable,
          columns: [
            ...effectiveColumns.map((c) => `primary.${c}`),
            ...effectiveJoinItems.flatMap((j: { rightColumns?: string[] }, i: number) => (j.rightColumns || []).map((c) => `join_${i}.${c}`)),
          ],
          conditions: filterConditions.length > 0 ? filterConditions : [],
        };
        body.join = {
          primaryConnectionId: connectionId,
          primaryTable: selectedTable,
          joins: effectiveJoinItems.map((j: { connectionId: string | number; table: string; joinType: string; leftColumn: string; rightColumn: string; rightColumns?: string[] }, i: number) => ({
            id: `join_${i}`,
            secondaryConnectionId: j.connectionId,
            secondaryTable: j.table,
            joinType: j.joinType,
            primaryColumn: j.leftColumn,
            secondaryColumn: j.rightColumn,
            secondaryColumns: j.rightColumns?.length ? j.rightColumns : undefined,
          })),
        };
      } else {
        body.filter = { ...filterPayload, table: selectedTable, columns: effectiveColumns.length > 0 ? effectiveColumns : undefined, conditions: filterConditions };
      }
    } else {
      body.filter = filterPayload;
    }
    if (cleanConfig) body.clean = cleanConfig;
    return body;
  }, [
    connectionId,
    selectedTable,
    columns,
    selectedTableInfo?.columns,
    allFilterConditions,
    outputTableName,
    outputMode,
    distinctColumn,
    useUnion,
    unionRightItems,
    unionAll,
    useJoin,
    joinItems,
    joinSecondaryConnectionId,
    joinSecondaryTable,
    joinLeftColumn,
    joinRightColumn,
    joinRightColumns,
    joinType,
    buildCleanConfig,
  ]);

  const handleRun = useCallback(async () => {
    if (!canRun || !connectionId || !selectedTable) return;
    setRunning(true);
    const guidedBody = buildGuidedConfigBody();
    if (!guidedBody) {
      setRunning(false);
      return;
    }
    const body = { etlId, ...guidedBody };
    try {
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al ejecutar");
    } finally {
      setRunning(false);
    }
  }, [canRun, connectionId, selectedTable, buildGuidedConfigBody, etlId]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const connectionName =
    connections.find((c) => String(c.id) === String(connectionId))?.title ?? "";

  const saveGuidedConfigToServer = useCallback(async (options?: { silent?: boolean }): Promise<boolean> => {
    let guidedConfig = buildGuidedConfigBody();
    if (!guidedConfig) {
      if (!options?.silent) toast.error("Completá al menos la conexión para guardar.");
      return false;
    }
    // Persistir siempre la tabla seleccionada: valor del <select> (lo que ve el usuario) o estado
    const tableToSave = (tableSelectRef.current?.value ?? selectedTable ?? "")?.trim() || undefined;
    if (tableToSave && typeof guidedConfig.filter === "object" && guidedConfig.filter !== null) {
      guidedConfig = {
        ...guidedConfig,
        filter: { ...(guidedConfig.filter as Record<string, unknown>), table: tableToSave },
      };
    }
    try {
      const res = await fetch("/api/etl/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etlId, guidedConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data?.error || "Error al guardar");
        return false;
      }
      if (!options?.silent) toast.success("Configuración guardada.");
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
      return false;
    }
  }, [etlId, buildGuidedConfigBody, selectedTable]);

  /** Avanza al paso siguiente y guarda la configuración actual en el ETL (sin toast). Espera el guardado para que se persista el estado actual (tabla, columnas, etc.). */
  const goToStepAndSave = useCallback(
    async (nextStep: StepId) => {
      await saveGuidedConfigToServer({ silent: true });
      setStep(nextStep);
    },
    [saveGuidedConfigToServer]
  );

  useImperativeHandle(
    ref,
    () => ({
      goToEjecutar: () => setStep("ejecutar"),
      getGuidedConfig: buildGuidedConfigBody,
      saveGuidedConfig: () => saveGuidedConfigToServer(),
      getCanRun: () => canRun,
      run: () => handleRun(),
    }),
    [buildGuidedConfigBody, saveGuidedConfigToServer, canRun, handleRun]
  );

  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;
  const canGoNextConexion = !!connectionId;
  const canGoNextOrigen = !!connectionId && !!selectedTable;
  const canGoNextFiltros = (selectedTableInfo?.columns?.length ?? 0) > 0 && columns.length > 0;
  const canGoNextDestino = outputTableName.trim().length > 0 && /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());
  const destinoInvalid = outputTableName.trim().length > 0 && !/^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  /** Crear ETL: wizard paso a paso. Editar ETL: /admin/etl/[id]/edit usa forceEditorMode; o cuando hay config guardada */
  const isEditorMode = !!forceEditorMode || !!initialGuidedConfig;

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden" style={{ background: "var(--platform-surface)", border: "1px solid var(--platform-border)" }}>
      {/* Header: en modo editor solo título + guardar; en wizard, stepper con progreso */}
      {isEditorMode ? (
        <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between gap-3" style={{ borderColor: "var(--platform-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>Editor del ETL</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Modificá cada sección debajo y guardá los cambios.</p>
          </div>
          <Button
            type="button"
            className="rounded-xl shrink-0"
            style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
            disabled={savingConfig}
            onClick={async () => {
              setSavingConfig(true);
              try {
                await saveGuidedConfigToServer();
              } finally {
                setSavingConfig(false);
              }
            }}
          >
            {savingConfig ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Guardando…
              </>
            ) : (
              "Guardar configuración"
            )}
          </Button>
        </div>
      ) : (
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
                  onClick={() => (!runSuccess && canJump) && setStep(s.id)}
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
      )}

      {/* Content: en modo editor todas las secciones visibles; en wizard solo el paso actual */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {(step === "conexion" || isEditorMode) && (
        <section id="seccion-conexion" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "conexion" || isEditorMode) && (
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
                  {!isEditorMode && (
                    <Button
                      type="button"
                      className="rounded-xl"
                      style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                      onClick={() => goToStepAndSave("origen")}
                      disabled={!canGoNextConexion}
                    >
                      Siguiente: Origen <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
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
        </section>
        )}

        {(step === "origen" || isEditorMode) && (
        <section id="seccion-origen" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "origen" || isEditorMode) && (
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
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Solo se muestran las tablas configuradas en la conexión. Agregá más desde Conexiones → Tablas para ETL.</p>
                  {loadingMeta ? (
                    <div className="mt-2 flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando tablas…
                    </div>
                  ) : (
                    <>
                      {tables.length > 0 && (
                        <input
                          type="text"
                          placeholder="Buscar tabla…"
                          value={tableSearchQuery}
                          onChange={(e) => setTableSearchQuery(e.target.value)}
                          className="w-full mt-2 rounded-xl border px-4 py-2.5 text-sm"
                          style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                        />
                      )}
                      <select
                        ref={tableSelectRef}
                        value={selectedTable ?? ""}
                        onChange={(e) => setSelectedTable(e.target.value || null)}
                        className="w-full mt-2 rounded-xl border px-4 py-3 text-sm"
                        style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                        disabled={!connectionId || tables.length === 0}
                      >
                        <option value="">{connectionId && tables.length === 0 ? "No hay tablas. Configurá tablas en Conexiones." : "Seleccionar tabla…"}</option>
                        {tables
                          .filter((t) => !tableSearchQuery.trim() || `${t.schema}.${t.name}`.toLowerCase().includes(tableSearchQuery.trim().toLowerCase()))
                          .map((t) => (
                            <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                              {t.schema}.{t.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  {!isEditorMode && (
                    <>
                      <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("conexion")}>
                        Atrás
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl"
                        style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                        onClick={() => goToStepAndSave("filtros")}
                        disabled={!canGoNextOrigen}
                      >
                        Siguiente: Columnas y filtros <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        </section>
        )}

        {(step === "transformacion" || isEditorMode) && (
        <section id="seccion-transformacion" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "transformacion" || isEditorMode) && (
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
                    <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
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

                  {/* UNION (opcional): múltiples tablas + columnas por tabla */}
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
                          if (!v) { setUnionRightConnectionId(null); setUnionRightTable(null); setUnionRightItems([]); }
                        }}
                      />
                      <Label htmlFor="use-union" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (UNION)</Label>
                    </div>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Apilar filas de otras tablas con las mismas columnas. Elegí una o más tablas y qué columnas traer de cada una.</p>
                    {useUnion && (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
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
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                          {unionRightTables.length > 0 && (
                            <input
                              type="text"
                              placeholder="Buscar tabla…"
                              value={unionTableSearch}
                              onChange={(e) => setUnionTableSearch(e.target.value)}
                              className="rounded-lg border px-3 py-2 text-sm w-full max-w-[200px]"
                              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            />
                          )}
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={unionRightTable ?? ""}
                            onChange={(e) => setUnionRightTable(e.target.value || null)}
                            disabled={!unionRightConnectionId || loadingUnionMeta}
                          >
                            <option value="">Elegir tabla</option>
                            {unionRightTables
                              .filter((t) => !unionTableSearch.trim() || `${t.schema}.${t.name}`.toLowerCase().includes(unionTableSearch.trim().toLowerCase()))
                              .map((t) => (
                                <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>{t.schema}.{t.name}</option>
                              ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-sm"
                            style={{ borderColor: "var(--platform-border)" }}
                            disabled={!unionRightConnectionId || !unionRightTable || unionRightItems.some((it) => it.table === unionRightTable)}
                            onClick={async () => {
                              if (!unionRightConnectionId || !unionRightTable) return;
                              try {
                                const res = await fetchMetadata(unionRightConnectionId, unionRightTable);
                                const data = await res.json();
                                const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
                                const mainCols = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
                                const defaultCols = mainCols.filter((c) => colNames.includes(c));
                                setUnionRightItems((prev) => [
                                  ...prev,
                                  { connectionId: unionRightConnectionId, table: unionRightTable, columns: defaultCols.length ? defaultCols : colNames, availableColumns: colNames.map((n: string) => ({ name: n })) },
                                ]);
                                setUnionRightTable(null);
                              } catch {
                                toast.error("No se pudieron cargar las columnas de la tabla");
                              }
                            }}
                          >
                            Agregar tabla
                          </Button>
                        </div>
                        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                          <input type="checkbox" checked={unionAll} onChange={(e) => setUnionAll(e.target.checked)} />
                          UNION ALL (incluir duplicados)
                        </label>
                        {unionRightItems.length > 0 && (
                          <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--platform-border)" }}>
                            <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tablas a apilar ({unionRightItems.length})</Label>
                            {unionRightItems.map((item, idx) => (
                              <div key={`${item.connectionId}-${item.table}-${idx}`} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{item.table}</span>
                                  <button type="button" className="text-xs rounded px-2 py-1 hover:opacity-80" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }} onClick={() => setUnionRightItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar</button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas a traer:</span>
                                  {(item.availableColumns ?? []).map((col) => (
                                    <label key={col.name} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                                      <input
                                        type="checkbox"
                                        checked={item.columns.includes(col.name)}
                                        onChange={(e) => {
                                          setUnionRightItems((prev) => prev.map((it, i) => i === idx ? { ...it, columns: e.target.checked ? [...it.columns, col.name] : it.columns.filter((c) => c !== col.name) } : it));
                                        }}
                                      />
                                      {col.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* JOIN (opcional): múltiples tablas + columnas por tabla */}
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
                          if (!v) { setJoinSecondaryConnectionId(null); setJoinSecondaryTable(null); setJoinLeftColumn(""); setJoinRightColumn(""); setJoinItems([]); }
                        }}
                      />
                      <Label htmlFor="use-join" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (JOIN)</Label>
                    </div>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Unir por una columna en común. Elegí una o más tablas secundarias, columnas de enlace y qué columnas traer de cada una.</p>
                    {useJoin && (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
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
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                          {joinRightTables.length > 0 && (
                            <input
                              type="text"
                              placeholder="Buscar tabla…"
                              value={joinTableSearch}
                              onChange={(e) => setJoinTableSearch(e.target.value)}
                              className="rounded-lg border px-3 py-2 text-sm w-full max-w-[200px]"
                              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            />
                          )}
                          <select
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                            value={joinSecondaryTable ?? ""}
                            onChange={(e) => { setJoinSecondaryTable(e.target.value || null); setJoinRightColumn(""); }}
                            disabled={!joinSecondaryConnectionId || loadingJoinMeta}
                          >
                            <option value="">Elegir tabla</option>
                            {joinRightTables
                              .filter((t) => !joinTableSearch.trim() || `${t.schema}.${t.name}`.toLowerCase().includes(joinTableSearch.trim().toLowerCase()))
                              .map((t) => (
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-sm"
                            style={{ borderColor: "var(--platform-border)" }}
                            disabled={!joinSecondaryConnectionId || !joinSecondaryTable || !joinLeftColumn || !joinRightColumn}
                            onClick={() => {
                              if (!joinSecondaryConnectionId || !joinSecondaryTable || !joinLeftColumn || !joinRightColumn) return;
                              setJoinItems((prev) => [
                                ...prev,
                                {
                                  id: `join_${prev.length}_${Date.now()}`,
                                  connectionId: joinSecondaryConnectionId,
                                  table: joinSecondaryTable,
                                  joinType,
                                  leftColumn: joinLeftColumn,
                                  rightColumn: joinRightColumn,
                                  rightColumns: joinRightColumns.length > 0 ? [...joinRightColumns] : [],
                                  availableColumns: joinRightTableInfo?.columns ?? [],
                                },
                              ]);
                              setJoinSecondaryTable(null);
                              setJoinLeftColumn("");
                              setJoinRightColumn("");
                              setJoinRightColumns([]);
                            }}
                          >
                            Agregar tabla
                          </Button>
                        </div>
                        {joinItems.length > 0 && (
                          <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--platform-border)" }}>
                            <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tablas a combinar ({joinItems.length})</Label>
                            {joinItems.map((item, idx) => (
                              <div key={item.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{item.table}</span>
                                  <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{item.joinType} · {item.leftColumn} = {item.rightColumn}</span>
                                  <button type="button" className="text-xs rounded px-2 py-1 hover:opacity-80" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }} onClick={() => setJoinItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar</button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas a traer:</span>
                                  {(item.availableColumns ?? []).map((col) => (
                                    <label key={col.name} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                                      <input
                                        type="checkbox"
                                        checked={item.rightColumns.includes(col.name)}
                                        onChange={(e) => {
                                          setJoinItems((prev) => prev.map((it, i) => i === idx ? { ...it, rightColumns: e.target.checked ? [...it.rightColumns, col.name] : it.rightColumns.filter((c) => c !== col.name) } : it));
                                        }}
                                      />
                                      {col.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-2">
              {!isEditorMode && (
                <>
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                    Atrás
                  </Button>
                  <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={() => goToStepAndSave("destino")}>
                    Siguiente: Destino <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "filtros" || isEditorMode) && (
        <section id="seccion-filtros" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "filtros" || isEditorMode) && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                3. Columnas y filtros (opcional)
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí qué columnas incluir y opcionalmente excluí filas con condiciones.
              </p>
            </div>
            {loadingColumns === selectedTable ? (
              <div className="flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando columnas…
              </div>
            ) : (selectedTableInfo?.columns?.length ?? 0) > 0 ? (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Columnas a incluir</Label>
                    <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}>
                      {(() => {
                        const allNames = (selectedTableInfo?.columns ?? []).map((x) => x.name);
                        return columns.length === 0 ? "Ninguna" : columns.length === allNames.length ? "Todas" : `${columns.length} seleccionadas`;
                      })()}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-7 text-xs"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setColumns((selectedTableInfo?.columns ?? []).map((x) => x.name))}
                    >
                      Seleccionar todo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-7 text-xs"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setColumns([])}
                    >
                      Quitar todo
                    </Button>
                  </div>
                  {columns.length === 0 && (
                    <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná al menos una columna para continuar.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(selectedTableInfo?.columns ?? []).map((c) => {
                      const active = columns.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            if (active) setColumns((prev) => prev.filter((x) => x !== c.name));
                            else setColumns((prev) => [...prev, c.name]);
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

                {/* Excluir filas por valores en columna */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Excluir filas (opcional)</Label>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                    Elegí una columna, cargá los valores que tiene la tabla y marcá cuáles excluir. Solo se incluirán las filas cuyo valor no esté marcado.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna</span>
                    <select
                      className="rounded-lg border px-3 py-2 text-sm min-w-[140px]"
                      style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                      value={distinctColumn ?? ""}
                      onChange={(e) => {
                        const col = e.target.value || null;
                        setDistinctColumn(col);
                        setDistinctValuesList([]);
                        setDistinctSearch("");
                      }}
                    >
                      <option value="">Elegir columna</option>
                      {(selectedTableInfo?.columns ?? []).map((col) => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      style={{ borderColor: "var(--platform-border)" }}
                      disabled={!distinctColumn || !connectionId || loadingDistinct}
                      onClick={async () => {
                        if (!distinctColumn || !connectionId || !selectedTable) return;
                        setLoadingDistinct(true);
                        setDistinctValuesList([]);
                        try {
                          const res = await fetch("/api/connection/distinct-values", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              connectionId,
                              table: selectedTable,
                              column: distinctColumn,
                            }),
                          });
                          const data = await res.json();
                          if (data.ok && Array.isArray(data.values)) setDistinctValuesList(data.values);
                          else toast.error(data?.error || "No se pudieron cargar los valores");
                        } catch (e: any) {
                          toast.error(e?.message || "Error al cargar");
                        } finally {
                          setLoadingDistinct(false);
                        }
                      }}
                    >
                      {loadingDistinct ? "Cargando…" : "Cargar valores"}
                    </Button>
                  </div>
                  {distinctValuesList.length > 0 && distinctColumn && (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar valor…"
                        value={distinctSearch}
                        onChange={(e) => setDistinctSearch(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                      />
                      <div className="max-h-48 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                        {distinctValuesList
                          .filter((v) => !distinctSearch.trim() || String(v).toLowerCase().includes(distinctSearch.trim().toLowerCase()))
                          .map((val) => {
                            const current = excludedValues.find((e) => e.column === distinctColumn);
                            const excluded = (current?.excluded ?? []).includes(String(val));
                            return (
                              <label
                                key={String(val)}
                                className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--platform-surface-hover)] text-sm"
                                style={{ color: "var(--platform-fg)" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={excluded}
                                  onChange={() => {
                                    setExcludedValues((prev) => {
                                      const entry = prev.find((e) => e.column === distinctColumn);
                                      const nextExcluded = entry ? [...entry.excluded] : [];
                                      const s = String(val);
                                      if (nextExcluded.includes(s)) {
                                        const filtered = nextExcluded.filter((x) => x !== s);
                                        if (filtered.length === 0) return prev.filter((e) => e.column !== distinctColumn);
                                        return prev.map((e) => e.column === distinctColumn ? { column: distinctColumn, excluded: filtered } : e);
                                      }
                                      nextExcluded.push(s);
                                      if (!entry) return [...prev, { column: distinctColumn, excluded: nextExcluded }];
                                      return prev.map((e) => e.column === distinctColumn ? { column: distinctColumn, excluded: nextExcluded } : e);
                                    });
                                  }}
                                />
                                <span className="truncate">{String(val)}</span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                        {excludedValues.find((e) => e.column === distinctColumn)?.excluded.length ?? 0} valor(es) marcados para excluir en esta columna.
                      </p>
                    </>
                  )}
                  {excludedValues.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {excludedValues.map(({ column, excluded }) => (
                        <span key={column} className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}>
                          {column}: {excluded.length} excluidos
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              {!isEditorMode && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => goToStepAndSave("origen")}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => goToStepAndSave("transformacion")}
                    disabled={!canGoNextFiltros}
                  >
                    Siguiente: Transformación <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "destino" || isEditorMode) && (
        <section id="seccion-destino" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "destino" || isEditorMode) && (
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
              {!isEditorMode && (
                <>
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("transformacion")}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => goToStepAndSave("ejecutar")}
                    disabled={!canGoNextDestino}
                  >
                    Ir a Ejecutar <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "ejecutar" || isEditorMode) && (
        <section id="seccion-ejecutar" className={isEditorMode ? "mb-10 pb-8" : ""}>
        {(step === "ejecutar" || isEditorMode) && (
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
                        {!selectedTable
                          ? "Elegí la tabla de origen en la sección 2 (Origen de datos)."
                          : !hasColumnsToRun
                            ? "Elegí al menos una columna en la sección 3 (Columnas y filtros) o esperá a que se carguen."
                            : !outputTableName.trim()
                              ? "Indicá un nombre para la tabla de destino."
                              : "El nombre de la tabla solo puede tener letras, números y guión bajo."}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!selectedTable && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("origen")}>
                            Ir a Origen
                          </Button>
                        )}
                        {selectedTable && !hasColumnsToRun && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                            Ir a Columnas y filtros
                          </Button>
                        )}
                        {(selectedTable && hasColumnsToRun) && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("destino")}>
                            Ir a Destino
                          </Button>
                        )}
                      </div>
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
                  {(buildCleanConfig() || (useUnion && unionRightItems.length > 0) || (useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)))) && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Sparkles className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                      <div>
                        <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Transformación</p>
                        <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                          {useUnion && unionRightItems.length > 0 && `UNION con ${unionRightItems.length} tabla(s)${unionAll ? " (ALL)" : ""}${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)) && !useUnion && `JOIN con ${joinItems.length > 0 ? joinItems.length : (joinSecondaryConnectionId && joinSecondaryTable ? 1 : 0)} tabla(s)${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {!useUnion && !useJoin && buildCleanConfig() && "Limpieza de nulos, texto, correcciones y/o duplicados"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("destino")}>
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
        </section>
        )}
      </div>
    </div>
  );
});

export default ETLGuidedFlowInner;
