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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type ConnectionTablesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  connectionTitle: string;
  connectionType: string;
  onSaved?: () => void;
};

type TableRow = { schema: string; name: string };

export default function ConnectionTablesDialog({
  open,
  onOpenChange,
  connectionId,
  connectionTitle,
  connectionType,
  onSaved,
}: ConnectionTablesDialogProps) {
  const [tablesText, setTablesText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discoveredTables, setDiscoveredTables] = useState<TableRow[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const isExcel = (connectionType || "").toLowerCase().includes("excel");

  useEffect(() => {
    if (!open || !connectionId) {
      setTablesText("");
      setDiscoveredTables([]);
      setSelectedKeys(new Set());
      return;
    }
    let isMounted = true;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("connections")
      .select("connection_tables")
      .eq("id", connectionId)
      .single()
      .then(({ data, error }) => {
        if (!isMounted) return;
        setLoading(false);
        if (error) {
          toast.error("No se pudo cargar la configuración de tablas");
          return;
        }
        const arr = (data as any)?.connection_tables;
        if (Array.isArray(arr) && arr.length > 0) {
          setTablesText(arr.map((t: unknown) => String(t)).join("\n"));
        } else {
          setTablesText("");
        }
      });
    return () => {
      isMounted = false;
    };
  }, [open, connectionId]);

  const handleDiscover = async () => {
    if (!connectionId) return;
    setDiscoverLoading(true);
    setDiscoveredTables([]);
    setSelectedKeys(new Set());
    try {
      const res = await fetch("/api/connection/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, discoverTables: true }),
      });
      const data = await res.json();
      if (!data.ok || !data.metadata?.tables?.length) {
        toast.error(data?.error || "No se pudieron listar tablas");
        return;
      }
      const list = (data.metadata.tables as TableRow[]).map((t) => ({ schema: t.schema, name: t.name }));
      setDiscoveredTables(list);
    } catch (e: any) {
      toast.error(e?.message || "Error al descubrir tablas");
    } finally {
      setDiscoverLoading(false);
    }
  };

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addSelected = () => {
    const existing = new Set(
      tablesText
        .split(/\n|,/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const toAdd = discoveredTables
      .filter((t) => {
        const key = `${t.schema}.${t.name}`;
        return selectedKeys.has(key) && !existing.has(key.toLowerCase());
      })
      .map((t) => `${t.schema}.${t.name}`);
    if (toAdd.length === 0) {
      toast.info("Ninguna tabla nueva para añadir");
      return;
    }
    const newLines = tablesText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    toAdd.forEach((line) => newLines.push(line));
    setTablesText(newLines.join("\n"));
    setSelectedKeys(new Set());
    toast.success(`${toAdd.length} tabla(s) añadida(s)`);
  };

  const filteredDiscovered = discoveredTables.filter((t) => {
    const key = `${t.schema}.${t.name}`.toLowerCase();
    return !discoverSearch.trim() || key.includes(discoverSearch.trim().toLowerCase());
  });

  const handleSave = async () => {
    if (!connectionId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const lines = tablesText
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { error } = await supabase
        .from("connections")
        .update({ connection_tables: lines })
        .eq("id", connectionId);
      if (error) throw error;
      toast.success(
        lines.length > 0
          ? `${lines.length} tabla(s) guardada(s). El ETL usará solo estas tablas.`
          : "Lista de tablas vacía. El ETL intentará listar todas (puede tardar)."
      );
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Tablas para ETL</DialogTitle>
          <DialogDescription>
            Definí qué tablas usar para &quot;{connectionTitle}&quot; ({connectionType}). Solo esas tablas aparecerán en el ETL al elegir esta conexión.
            Una por línea o separadas por coma. Podés descubrir tablas desde la base y añadirlas con el buscador.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <textarea
              className="min-h-[140px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              placeholder={"PUBLIC.VENTAS\nPUBLIC.CLIENTES\nschema.tabla"}
              value={tablesText}
              onChange={(e) => setTablesText(e.target.value)}
              style={{
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
                background: "var(--platform-surface)",
              }}
            />
            {!isExcel && (
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDiscover}
                    disabled={discoverLoading}
                  >
                    {discoverLoading ? "Cargando…" : "Descubrir tablas"}
                  </Button>
                  {discoveredTables.length > 0 && (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar tabla…"
                        value={discoverSearch}
                        onChange={(e) => setDiscoverSearch(e.target.value)}
                        className="flex-1 min-w-[120px] rounded-md border px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                      />
                      <Button type="button" size="sm" onClick={addSelected} disabled={selectedKeys.size === 0}>
                        Añadir seleccionadas ({selectedKeys.size})
                      </Button>
                    </>
                  )}
                </div>
                {discoveredTables.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border py-1" style={{ borderColor: "var(--platform-border)" }}>
                    {filteredDiscovered.map((t) => {
                      const key = `${t.schema}.${t.name}`;
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--platform-surface-hover)] cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleSelected(key)}
                          />
                          <span style={{ color: "var(--platform-fg)" }}>{key}</span>
                        </label>
                      );
                    })}
                    {filteredDiscovered.length === 0 && (
                      <p className="px-2 py-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Ninguna tabla coincide con la búsqueda.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
