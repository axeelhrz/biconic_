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

  useEffect(() => {
    if (!open || !connectionId) {
      setTablesText("");
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
      <DialogContent className="sm:max-w-[520px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Tablas para ETL</DialogTitle>
          <DialogDescription>
            Definí qué tablas usar para &quot;{connectionTitle}&quot; ({connectionType}). Una por línea o separadas por coma.
            Si la base tiene muchas tablas y el servidor no puede listarlas, solo se usarán las que figuren acá.
            Ejemplo: <code className="text-xs bg-muted px-1 rounded">PUBLIC.VENTAS</code>, <code className="text-xs bg-muted px-1 rounded">PUBLIC.CLIENTES</code>
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <textarea
            className="min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            placeholder={"PUBLIC.VENTAS\nPUBLIC.CLIENTES\nPUBLIC.PRODUCTOS"}
            value={tablesText}
            onChange={(e) => setTablesText(e.target.value)}
            style={{
              borderColor: "var(--platform-border)",
              color: "var(--platform-fg)",
              background: "var(--platform-surface)",
            }}
          />
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
