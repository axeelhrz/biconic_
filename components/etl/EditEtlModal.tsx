"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getEtlForPreview, updateEtlAdmin } from "@/app/admin/(main)/etl/actions";
import { getConnections } from "@/lib/actions/connections";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type GuidedConfig = {
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
  status: string;
  published?: boolean;
  created_at?: string;
  output_table?: string | null;
  ownerName: string | null;
  clientName: string | null;
  guidedConfig: GuidedConfig | null;
};

type Connection = { id: string; name: string };

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2";
const labelClass = "text-xs font-medium uppercase tracking-wider";

export default function EditEtlModal({
  etlId,
  open,
  onOpenChange,
  clientId,
  onSaved,
}: {
  etlId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tables, setTables] = useState<{ schema: string; name: string }[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state (mirrors guidedConfig + title/status)
  const [title, setTitle] = useState("");
  const [published, setPublished] = useState(false);
  const [connectionId, setConnectionId] = useState<string>("");
  const [table, setTable] = useState("");
  const [columnsText, setColumnsText] = useState("");
  const [conditions, setConditions] = useState<Array<{ column: string; operator: string; value: string }>>([]);
  const [excludeRowsColumn, setExcludeRowsColumn] = useState("");
  const [destTable, setDestTable] = useState("");
  const [destMode, setDestMode] = useState<"overwrite" | "append">("overwrite");

  const loadData = useCallback(async () => {
    if (!etlId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const [previewRes, conns] = await Promise.all([
        getEtlForPreview(etlId),
        getConnections(clientId ? { clientId } : undefined),
      ]);
      if (!previewRes.ok || !previewRes.data) {
        setError(previewRes.error ?? "Error al cargar");
        return;
      }
      const d = previewRes.data as PreviewData;
      setData(d);
      setConnections((conns ?? []).map((c) => ({ id: c.id, name: c.title || c.id })));

      setTitle(d.title ?? d.name ?? "");
      setPublished(d.published ?? false);

      const cfg = d.guidedConfig;
      if (cfg?.connectionId != null) setConnectionId(String(cfg.connectionId));
      if (cfg?.filter) {
        setTable(cfg.filter.table ?? "");
        setColumnsText((cfg.filter.columns ?? []).join(", "));
        setConditions(
          (cfg.filter.conditions ?? []).map((c) => ({
            column: c.column ?? "",
            operator: c.operator ?? "=",
            value: c.value ?? "",
          }))
        );
        setExcludeRowsColumn(cfg.filter.excludeRowsColumn ?? "");
      }
      const endTable = cfg?.end?.target?.table ?? d.output_table ?? "";
      setDestTable(endTable);
      setDestMode((cfg?.end?.mode as "overwrite" | "append") ?? "overwrite");
    } catch {
      setError("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [etlId, open, clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch tables when connection changes
  useEffect(() => {
    if (!connectionId) {
      setTables([]);
      setTableColumns([]);
      return;
    }
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.metadata?.tables) setTables(res.metadata.tables);
        else setTables([]);
      })
      .catch(() => setTables([]));
  }, [connectionId]);

  // Fetch columns for selected table (for "Excluir filas" dropdown)
  useEffect(() => {
    if (!connectionId || !table) {
      setTableColumns([]);
      return;
    }
    setLoadingColumns(true);
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, tableName: table }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.metadata?.tables?.[0]?.columns) {
          const cols = (res.metadata.tables[0].columns as { name: string }[]).map((c) => c.name);
          setTableColumns(cols);
        } else setTableColumns([]);
      })
      .catch(() => setTableColumns([]))
      .finally(() => setLoadingColumns(false));
  }, [connectionId, table]);

  const addCondition = () => setConditions((c) => [...c, { column: "", operator: "=", value: "" }]);
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, j) => j !== i));
  const updateCondition = (i: number, field: "column" | "operator" | "value", value: string) => {
    setConditions((c) => c.map((orig, j) => (j === i ? { ...orig, [field]: value } : orig)));
  };

  const buildGuidedConfig = useCallback((): Record<string, unknown> => {
    const cols = columnsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const connId = connectionId ? (connections.find((c) => c.id === connectionId) ? connectionId : data?.guidedConfig?.connectionId) : data?.guidedConfig?.connectionId;
    const filterPayload: Record<string, unknown> = {
      table: table || undefined,
      columns: cols.length > 0 ? cols : undefined,
      conditions: conditions.filter((c) => c.column.trim()).map((c) => ({ column: c.column, operator: c.operator || "=", value: c.value })),
    };
    if (excludeRowsColumn.trim()) filterPayload.excludeRowsColumn = excludeRowsColumn.trim();

    const body: Record<string, unknown> = {
      connectionId: connId ?? undefined,
      filter: filterPayload,
      end: {
        target: { type: "supabase", table: destTable.trim() || undefined },
        mode: destMode,
      },
    };

    // Preserve union/join/clean from original if we're not editing them in this form
    if (data?.guidedConfig?.union) body.union = data.guidedConfig.union;
    if (data?.guidedConfig?.join) body.join = data.guidedConfig.join;
    if (data?.guidedConfig?.clean) body.clean = data.guidedConfig.clean;

    return body;
  }, [connectionId, connections, data?.guidedConfig, table, columnsText, conditions, excludeRowsColumn, destTable, destMode]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const resTitle = await updateEtlAdmin(etlId, {
        title: title.trim() || undefined,
        status: published ? "Publicado" : "Borrador",
        published,
      });
      if (!resTitle.ok) {
        toast.error(resTitle.error ?? "Error al actualizar");
        return;
      }

      const guidedConfig = buildGuidedConfig();
      const resConfig = await fetch("/api/etl/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etlId, guidedConfig }),
      });
      const json = await resConfig.json();
      if (!json.ok) {
        toast.error(json.error ?? "Error al guardar configuración");
        return;
      }
      toast.success("ETL actualizado correctamente");
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const tableOptions = tables.map((t) => `${t.schema}.${t.name}`);
  const style = {
    bg: "linear-gradient(180deg, #1a1d21 0%, #141619 100%)",
    border: "rgba(34, 197, 94, 0.15)",
    input: "rgba(0,0,0,0.2)",
    text: "rgba(255,255,255,0.95)",
    muted: "rgba(255,255,255,0.5)",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[640px] p-0 gap-0 border-0"
        style={{ background: style.bg, boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(34, 197, 94, 0.15)" }}
      >
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold pr-8" style={{ color: style.text }}>
              Editar ETL
            </DialogTitle>
          </DialogHeader>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "rgba(34, 197, 94, 0.9)" }} />
          </div>
        )}

        {error && (
          <p className="text-sm py-4 px-6" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}

        {!loading && !error && data && (
          <div className="space-y-5 px-6 pb-6 pt-2">
            {/* Título y estado */}
            <div className="space-y-2">
              <label className={labelClass} style={{ color: style.muted }}>
                Título
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                style={{ background: style.input, borderColor: style.border, color: style.text }}
                placeholder="Nombre del ETL"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-published"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="rounded border"
                  style={{ accentColor: "rgba(34, 197, 94, 0.9)" }}
                />
                <label htmlFor="edit-published" className="text-sm" style={{ color: style.text }}>
                  Publicado
                </label>
              </div>
            </div>

            {/* Origen: conexión y tabla */}
            <div className="space-y-2">
              <span className={labelClass} style={{ color: style.muted }}>
                Origen
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: style.muted }}>Conexión</label>
                  <select
                    value={connectionId}
                    onChange={(e) => setConnectionId(e.target.value)}
                    className={inputClass}
                    style={{ background: style.input, borderColor: style.border, color: style.text }}
                  >
                    <option value="">Seleccionar conexión</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: style.muted }}>Tabla</label>
                  {tableOptions.length > 0 ? (
                    <select
                      value={table}
                      onChange={(e) => setTable(e.target.value)}
                      className={inputClass}
                      style={{ background: style.input, borderColor: style.border, color: style.text }}
                    >
                      <option value="">Seleccionar tabla</option>
                      {tableOptions.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={table}
                      onChange={(e) => setTable(e.target.value)}
                      className={inputClass}
                      style={{ background: style.input, borderColor: style.border, color: style.text }}
                      placeholder="ej. PUBLIC.MITABLA"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="text-[10px] block mb-1" style={{ color: style.muted }}>Columnas (separadas por coma o nueva línea)</label>
                <textarea
                  value={columnsText}
                  onChange={(e) => setColumnsText(e.target.value)}
                  rows={3}
                  className={inputClass}
                  style={{ background: style.input, borderColor: style.border, color: style.text }}
                  placeholder="col1, col2, col3"
                />
              </div>
            </div>

            {/* Condiciones */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={labelClass} style={{ color: style.muted }}>Condiciones</span>
                <button
                  type="button"
                  onClick={addCondition}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "rgba(34, 197, 94, 0.9)" }}
                >
                  <Plus className="h-3.5 w-3.5" /> Añadir
                </button>
              </div>
              {conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap">
                  <input
                    type="text"
                    value={cond.column}
                    onChange={(e) => updateCondition(i, "column", e.target.value)}
                    placeholder="Columna"
                    className={`${inputClass} flex-1 min-w-0`}
                    style={{ background: style.input, borderColor: style.border, color: style.text }}
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(i, "operator", e.target.value)}
                    className={inputClass}
                    style={{ background: style.input, borderColor: style.border, color: style.text, width: "100px" }}
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value="in">in</option>
                    <option value="not in">not in</option>
                    <option value="like">like</option>
                  </select>
                  <input
                    type="text"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, "value", e.target.value)}
                    placeholder="Valor"
                    className={`${inputClass} flex-1 min-w-0`}
                    style={{ background: style.input, borderColor: style.border, color: style.text }}
                  />
                  <button
                    type="button"
                    onClick={() => removeCondition(i)}
                    className="p-2 rounded"
                    style={{ color: style.muted }}
                    aria-label="Quitar condición"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Excluir filas */}
            <div className="space-y-2">
              <label className={labelClass} style={{ color: style.muted }}>Excluir filas (columna)</label>
              <select
                value={excludeRowsColumn}
                onChange={(e) => setExcludeRowsColumn(e.target.value)}
                className={inputClass}
                style={{ background: style.input, borderColor: style.border, color: style.text }}
                disabled={loadingColumns}
              >
                <option value="">Ninguna</option>
                {excludeRowsColumn && !tableColumns.includes(excludeRowsColumn) && (
                  <option value={excludeRowsColumn}>{excludeRowsColumn}</option>
                )}
                {tableColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {table && tableColumns.length === 0 && !loadingColumns && (
                <p className="text-[10px]" style={{ color: style.muted }}>Selecciona conexión y tabla para cargar columnas</p>
              )}
            </div>

            {/* Destino */}
            <div className="space-y-2">
              <span className={labelClass} style={{ color: style.muted }}>Destino</span>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={destTable}
                  onChange={(e) => setDestTable(e.target.value)}
                  className={inputClass}
                  style={{ background: style.input, borderColor: style.border, color: style.text, flex: "1 1 200px" }}
                  placeholder="Nombre de tabla destino"
                />
                <select
                  value={destMode}
                  onChange={(e) => setDestMode(e.target.value as "overwrite" | "append")}
                  className={inputClass}
                  style={{ background: style.input, borderColor: style.border, color: style.text, width: "140px" }}
                >
                  <option value="overwrite">Sobrescribir</option>
                  <option value="append">Agregar</option>
                </select>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: style.border }}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border px-4 py-2 text-sm font-medium"
                style={{ borderColor: style.border, color: style.text }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl px-5 py-2 text-sm font-semibold flex items-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                  color: "#fff",
                  boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)",
                }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
