"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Table2 } from "lucide-react";

type ConnectionConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  /** Al hacer clic en "Editar tablas", se llama con (id, título, tipo) para abrir el diálogo de tablas desde la página */
  onOpenTables?: (connectionId: string, connectionTitle: string, connectionType: string) => void;
};

type ConnectionRow = {
  id: string;
  name: string;
  type: string;
  db_host: string | null;
  db_name: string | null;
  db_user: string | null;
  db_port: number | null;
  connection_tables: string[] | null;
  updated_at: string;
  original_file_name?: string | null;
};

export default function ConnectionConfigDialog({
  open,
  onOpenChange,
  connectionId,
  onOpenTables,
}: ConnectionConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [conn, setConn] = useState<ConnectionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !connectionId) {
      setConn(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("connections")
      .select("id, name, type, db_host, db_name, db_user, db_port, connection_tables, updated_at, original_file_name")
      .eq("id", connectionId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) {
          setError(err.message);
          setConn(null);
          return;
        }
        setConn(data as ConnectionRow);
        setError(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, connectionId]);

  const tables = conn?.connection_tables ?? [];
  const hasTables = Array.isArray(tables) && tables.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" showCloseButton>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--platform-fg)" }}>
            Configuración de la conexión
          </DialogTitle>
          <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
            Datos de la conexión y tablas seleccionadas para el ETL.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm py-4" style={{ color: "var(--platform-fg-muted)" }}>
            Cargando…
          </p>
        ) : error ? (
          <p className="text-sm py-4" style={{ color: "var(--platform-error, #dc2626)" }}>
            {error}
          </p>
        ) : conn ? (
          <div className="space-y-5">
            {/* Datos de la conexión */}
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
              <h4 className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
                Datos de la conexión
              </h4>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Nombre</dt>
                  <dd style={{ color: "var(--platform-fg)" }}>{conn.name}</dd>
                </div>
                <div>
                  <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tipo</dt>
                  <dd style={{ color: "var(--platform-fg)" }}>{conn.type}</dd>
                </div>
                {conn.db_host != null && (
                  <div>
                    <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Host</dt>
                    <dd style={{ color: "var(--platform-fg)" }}>{conn.db_host}</dd>
                  </div>
                )}
                {conn.db_name != null && (
                  <div>
                    <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Base de datos</dt>
                    <dd style={{ color: "var(--platform-fg)" }}>{conn.db_name}</dd>
                  </div>
                )}
                {conn.db_user != null && (
                  <div>
                    <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Usuario</dt>
                    <dd style={{ color: "var(--platform-fg)" }}>{conn.db_user}</dd>
                  </div>
                )}
                {conn.db_port != null && (
                  <div>
                    <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Puerto</dt>
                    <dd style={{ color: "var(--platform-fg)" }}>{conn.db_port}</dd>
                  </div>
                )}
                {conn.original_file_name && (
                  <div>
                    <dt className="font-medium" style={{ color: "var(--platform-fg-muted)" }}>Archivo</dt>
                    <dd style={{ color: "var(--platform-fg)" }} className="truncate">{conn.original_file_name}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Tablas seleccionadas */}
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
                  Tablas seleccionadas para ETL
                </h4>
                {onOpenTables && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => {
                      onOpenChange(false);
                      onOpenTables(connectionId!, conn.name, conn.type);
                    }}
                  >
                    <Table2 className="h-4 w-4 mr-1.5" />
                    Editar tablas
                  </Button>
                )}
              </div>
              {hasTables ? (
                <ul className="max-h-48 overflow-y-auto space-y-1 text-sm font-mono" style={{ color: "var(--platform-fg)" }}>
                  {tables.map((t, i) => (
                    <li key={i} className="py-0.5">{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                  Ninguna tabla configurada. En el ETL se listarán todas las tablas disponibles. Podés elegir tablas con &quot;Editar tablas&quot;.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
