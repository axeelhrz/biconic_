"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Table2 } from "lucide-react";

const CONNECTION_TYPE_OPTIONS: SelectOption[] = [
  { value: "mysql", label: "MySQL" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "firebird", label: "Firebird (Flexxus)" },
  { value: "excel", label: "Archivo Excel/CSV" },
];

type ConnectionConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  mode?: "view" | "edit";
  onSaved?: () => void;
  /** Al hacer clic en "Editar tablas", abre el diálogo de tablas (el padre cierra este y abre ese) */
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

type FormValues = {
  name: string;
  type: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_port: string;
};

const inputClass =
  "w-full h-11 px-4 rounded-xl text-sm border bg-[var(--platform-surface)] border-[var(--platform-border)] text-[var(--platform-fg)] placeholder:text-[var(--platform-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30 focus:border-[var(--platform-accent)]";

export default function ConnectionConfigDialog({
  open,
  onOpenChange,
  connectionId,
  mode = "edit",
  onSaved,
  onOpenTables,
}: ConnectionConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conn, setConn] = useState<ConnectionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isView = mode === "view";

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      type: "",
      db_host: "",
      db_name: "",
      db_user: "",
      db_port: "",
    },
  });

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
        const row = data as ConnectionRow;
        setConn(row);
        setError(null);
        reset({
          name: row.name ?? "",
          type: row.type ?? "",
          db_host: row.db_host ?? "",
          db_name: row.db_name ?? "",
          db_user: row.db_user ?? "",
          db_port: row.db_port != null ? String(row.db_port) : "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, connectionId, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!connectionId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const portNum = values.db_port.trim() ? parseInt(values.db_port, 10) : null;
      const { error: updateError } = await supabase
        .from("connections")
        .update({
          name: values.name.trim(),
          type: values.type,
          db_host: values.db_host.trim() || null,
          db_name: values.db_name.trim() || null,
          db_user: values.db_user.trim() || null,
          db_port: portNum,
        })
        .eq("id", connectionId);

      if (updateError) throw updateError;
      toast.success("Conexión actualizada");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const isExcel = conn?.type === "excel" || conn?.type === "excel_file";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px] p-0 gap-0 overflow-hidden border rounded-2xl"
        showCloseButton
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--platform-border)" }}>
          <DialogTitle className="text-xl font-semibold" style={{ color: "var(--platform-fg)" }}>
            {isView ? "Vista previa de la conexión" : "Configurar conexión"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
            {isView
              ? "Datos de la conexión (solo lectura)."
              : "Editá los parámetros de la conexión y guardá los cambios."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="px-6 py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            Cargando…
          </div>
        ) : error ? (
          <div
            className="mx-6 mt-4 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(248,113,113,0.3)",
              background: "var(--platform-surface)",
              color: "var(--platform-danger)",
            }}
          >
            {error}
          </div>
        ) : conn ? (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
            <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                  Nombre de la conexión
                </label>
                {isView ? (
                  <p className="py-2.5 text-sm" style={{ color: "var(--platform-fg)" }}>{conn.name}</p>
                ) : (
                  <Input
                    {...register("name", { required: "Completá el nombre" })}
                    placeholder="Ej. Ventas 2025"
                    className={inputClass}
                  />
                )}
                {errors.name && (
                  <p className="mt-1 text-xs" style={{ color: "var(--platform-danger)" }}>{errors.name.message}</p>
                )}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                  Tipo
                </label>
                {isView ? (
                  <p className="py-2.5 text-sm capitalize" style={{ color: "var(--platform-fg)" }}>{conn.type}</p>
                ) : (
                  <Controller
                    name="type"
                    control={control}
                    rules={{ required: "Seleccione un tipo" }}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        options={CONNECTION_TYPE_OPTIONS}
                        placeholder="Tipo"
                        disablePortal
                      />
                    )}
                  />
                )}
              </div>

              {!isExcel && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                        Host
                      </label>
                      {isView ? (
                        <p className="py-2.5 text-sm truncate" style={{ color: "var(--platform-fg)" }}>{conn.db_host || "—"}</p>
                      ) : (
                        <Input
                          {...register("db_host")}
                          placeholder="Ej. localhost"
                          className={inputClass}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                        Puerto
                      </label>
                      {isView ? (
                        <p className="py-2.5 text-sm" style={{ color: "var(--platform-fg)" }}>{conn.db_port ?? "—"}</p>
                      ) : (
                        <Input
                          {...register("db_port")}
                          type="number"
                          placeholder="3306"
                          className={inputClass}
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                      Base de datos
                    </label>
                    {isView ? (
                      <p className="py-2.5 text-sm truncate" style={{ color: "var(--platform-fg)" }}>{conn.db_name || "—"}</p>
                    ) : (
                      <Input
                        {...register("db_name")}
                        placeholder="Nombre de la base"
                        className={inputClass}
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                      Usuario
                    </label>
                    {isView ? (
                      <p className="py-2.5 text-sm" style={{ color: "var(--platform-fg)" }}>{conn.db_user || "—"}</p>
                    ) : (
                      <Input
                        {...register("db_user")}
                        placeholder="Usuario de la base"
                        className={inputClass}
                      />
                    )}
                  </div>
                </>
              )}

              {isExcel && conn.original_file_name && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                    Archivo
                  </label>
                  <p className="py-2.5 text-sm truncate" style={{ color: "var(--platform-fg)" }}>{conn.original_file_name}</p>
                </div>
              )}

              {/* Tablas seleccionadas para ETL */}
              {(conn.type === "firebird" || conn.type === "mysql" || conn.type === "postgres" || conn.type === "postgresql") && (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
                      <Table2 className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
                      Tablas para ETL
                    </h4>
                    {onOpenTables && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenTables(connectionId!, conn.name, conn.type);
                        }}
                        className="text-sm font-medium rounded-lg px-3 py-1.5 transition-opacity hover:opacity-90"
                        style={{
                          border: "1px solid var(--platform-accent)",
                          color: "var(--platform-accent)",
                          background: "transparent",
                        }}
                      >
                        Editar tablas
                      </button>
                    )}
                  </div>
                  {Array.isArray(conn.connection_tables) && conn.connection_tables.length > 0 ? (
                    <ul className="max-h-40 overflow-y-auto space-y-1 text-sm font-mono rounded-lg py-1" style={{ color: "var(--platform-fg-muted)" }}>
                      {conn.connection_tables.map((t, i) => (
                        <li key={i} className="truncate py-0.5" title={String(t)}>{String(t)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm py-1" style={{ color: "var(--platform-fg-muted)" }}>
                      Ninguna tabla seleccionada. En el ETL se listarán todas las disponibles. Usá &quot;Editar tablas&quot; para elegir cuáles incluir.
                    </p>
                  )}
                </div>
              )}

              <div className="text-xs" style={{ color: "var(--platform-muted)" }}>
                Última actualización: {conn.updated_at ? new Date(conn.updated_at).toLocaleString() : "—"}
              </div>
            </div>

            <div
              className="flex flex-row justify-end gap-3 px-6 py-4 mt-auto border-t"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 px-4 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  color: "var(--platform-fg)",
                  border: "1px solid var(--platform-border)",
                  background: "var(--platform-bg)",
                }}
              >
                {isView ? "Cerrar" : "Cancelar"}
              </button>
              {!isView && (
                <button
                  type="submit"
                  disabled={saving || !isDirty}
                  className="h-10 px-5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{
                    color: "var(--platform-accent-fg)",
                    background: "var(--platform-accent)",
                  }}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              )}
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
