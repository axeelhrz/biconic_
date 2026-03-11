"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { toast } from "sonner";
import { Table2, Loader2, ChevronDown, ChevronUp, CheckSquare, Square } from "lucide-react";

type ConnectionTablesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  connectionTitle: string;
  connectionType: string;
  onSaved?: () => void;
};

type TableRow = { schema: string; name: string };

function tableKey(t: TableRow) {
  return `${t.schema}.${t.name}`;
}

export default function ConnectionTablesDialog({
  open,
  onOpenChange,
  connectionId,
  connectionTitle,
  connectionType,
  onSaved,
}: ConnectionTablesDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allTables, setAllTables] = useState<TableRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchSelected, setSearchSelected] = useState("");
  const [searchAvailable, setSearchAvailable] = useState("");

  const isExcel = (connectionType || "").toLowerCase().includes("excel");

  // Cargar connection_tables actuales y todas las tablas de la base (metadata)
  useEffect(() => {
    if (!open || !connectionId || isExcel) {
      setAllTables([]);
      setSelectedKeys(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();

    const loadConnectionTables = supabase
      .from("connections")
      .select("connection_tables")
      .eq("id", connectionId)
      .single();

    const loadMetadata = fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, discoverTables: true }),
    }).then((r) => safeJsonResponse<{ ok?: boolean; metadata?: { tables?: TableRow[] }; error?: string }>(r));

    Promise.all([loadConnectionTables, loadMetadata])
      .then(([connRes, metaData]) => {
        if (cancelled) return;
        const current = Array.isArray((connRes.data as any)?.connection_tables)
          ? ((connRes.data as any).connection_tables as string[])
          : [];
        setSelectedKeys(new Set(current));

        if (metaData?.ok && Array.isArray(metaData.metadata?.tables) && metaData.metadata.tables.length > 0) {
          const list = (metaData.metadata.tables as TableRow[]).map((t) => ({
            schema: t.schema || "PUBLIC",
            name: t.name,
          }));
          setAllTables(list);
        } else {
          setAllTables([]);
          if (current.length > 0) {
            setAllTables(current.map((s) => {
              const parts = s.split(".");
              return { schema: parts[0] || "PUBLIC", name: parts[1] || s };
            }));
          }
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudieron cargar las tablas");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, connectionId, isExcel]);

  const selectedList = allTables.filter((t) => selectedKeys.has(tableKey(t)));
  const availableList = allTables.filter((t) => !selectedKeys.has(tableKey(t)));

  const filterList = (list: TableRow[], search: string) => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((t) => tableKey(t).toLowerCase().includes(q));
  };

  const filteredSelected = filterList(selectedList, searchSelected);
  const filteredAvailable = filterList(availableList, searchAvailable);

  const addToSelected = (key: string) => {
    setSelectedKeys((prev) => new Set([...prev, key]));
  };

  const removeFromSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const selectAllAvailable = () => {
    availableList.forEach((t) => addToSelected(tableKey(t)));
    toast.success("Todas las tablas disponibles añadidas");
  };

  const quitarTodas = () => {
    setSelectedKeys(new Set());
    toast.success("Se quitaron todas las tablas seleccionadas");
  };

  const handleSave = async () => {
    if (!connectionId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const lines = Array.from(selectedKeys);
      const { error } = await supabase
        .from("connections")
        .update({ connection_tables: lines })
        .eq("id", connectionId);
      if (error) throw error;
      toast.success(
        lines.length > 0
          ? `${lines.length} tabla(s) guardada(s). El ETL usará solo estas tablas.`
          : "Lista vacía. El ETL listará todas las tablas disponibles."
      );
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30";
  const listClass = "max-h-[220px] overflow-y-auto rounded-lg border py-1";
  const listStyle = { borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[620px] p-0 gap-0 overflow-hidden rounded-2xl border"
        showCloseButton
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
        }}
      >
        <div className="relative">
          <div className="absolute left-0 right-0 top-0 h-1" style={{ background: "var(--platform-gradient)" }} />
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
              >
                <Table2 className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                  Tablas para ETL
                </DialogTitle>
                <DialogDescription className="mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                  Definí qué tablas usar para &quot;{connectionTitle}&quot; ({connectionType}). Las seleccionadas aparecen arriba; las disponibles abajo. Solo las seleccionadas se verán en el ETL.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4" style={{ color: "var(--platform-fg-muted)" }}>
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: "var(--platform-accent)" }} />
              <span className="text-sm font-medium">Cargando tablas…</span>
            </div>
          ) : (
            <>
              {/* Arriba: Tablas seleccionadas */}
              <div
                className="rounded-xl border p-4 mb-4"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ChevronUp className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
                      Tablas seleccionadas
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                    >
                      {selectedList.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={quitarTodas}
                    disabled={selectedList.length === 0}
                    className="text-xs font-medium rounded-lg px-2.5 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ border: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}
                  >
                    Quitar todas
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Buscar en seleccionadas…"
                  value={searchSelected}
                  onChange={(e) => setSearchSelected(e.target.value)}
                  className={`${inputClass} mb-2`}
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)", color: "var(--platform-fg)" }}
                />
                <div className={listClass} style={listStyle}>
                  {filteredSelected.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                      {selectedList.length === 0 ? "Ninguna tabla seleccionada. Marcá tablas en la lista de abajo." : "Ninguna coincide con la búsqueda."}
                    </p>
                  ) : (
                    <ul className="space-y-0">
                      {filteredSelected.map((t) => {
                        const key = tableKey(t);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 px-4 py-2 cursor-pointer text-sm font-mono transition-colors hover:bg-[var(--platform-surface-hover)]"
                            style={{ color: "var(--platform-fg)" }}
                          >
                            <CheckSquare className="h-4 w-4 shrink-0" style={{ color: "var(--platform-accent)" }} />
                            <input
                              type="checkbox"
                              checked
                              onChange={() => removeFromSelected(key)}
                              className="sr-only"
                            />
                            <span className="truncate" title={key}>{key}</span>
                          </label>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Abajo: Tablas disponibles */}
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4" style={{ color: "var(--platform-muted)" }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
                      Tablas disponibles
                    </span>
                    <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                      {availableList.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={selectAllAvailable}
                    disabled={availableList.length === 0}
                    className="text-xs font-medium rounded-lg px-2.5 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ border: "1px solid var(--platform-accent)", color: "var(--platform-accent)" }}
                  >
                    Seleccionar todas
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Buscar en disponibles…"
                  value={searchAvailable}
                  onChange={(e) => setSearchAvailable(e.target.value)}
                  className={`${inputClass} mb-2`}
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)", color: "var(--platform-fg)" }}
                />
                <div className={listClass} style={listStyle}>
                  {filteredAvailable.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                      {availableList.length === 0 ? "No hay más tablas o ya están todas seleccionadas." : "Ninguna coincide con la búsqueda."}
                    </p>
                  ) : (
                    <ul className="space-y-0">
                      {filteredAvailable.map((t) => {
                        const key = tableKey(t);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 px-4 py-2 cursor-pointer text-sm font-mono transition-colors hover:bg-[var(--platform-surface-hover)]"
                            style={{ color: "var(--platform-fg-muted)" }}
                          >
                            <Square className="h-4 w-4 shrink-0" style={{ color: "var(--platform-border)" }} />
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => addToSelected(key)}
                              className="sr-only"
                            />
                            <span className="truncate" title={key}>{key}</span>
                          </label>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter
          className="px-6 py-4 border-t gap-3 shrink-0"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 px-5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              color: "var(--platform-fg)",
              border: "1px solid var(--platform-border)",
              background: "var(--platform-bg)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="h-10 px-5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ color: "var(--platform-accent-fg)", background: "var(--platform-accent)" }}
          >
            {saving ? (
              <>
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                Guardando…
              </>
            ) : (
              "Guardar"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
