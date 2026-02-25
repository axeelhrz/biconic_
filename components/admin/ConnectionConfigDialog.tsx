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
import { Table2, Database, Server, User, Hash, FileText, Loader2, Pencil, Building2 } from "lucide-react";

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
  onOpenTables?: (connectionId: string, connectionTitle: string, connectionType: string) => void;
};

type ConnectionRow = {
  id: string;
  name: string;
  type: string;
  client_id: string | null;
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
  client_id: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_port: string;
};

type ClientOption = { id: string; company_name: string };

const inputClass =
  "w-full h-11 px-4 rounded-xl text-sm border bg-[var(--platform-surface)] border-[var(--platform-border)] text-[var(--platform-fg)] placeholder:text-[var(--platform-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30 focus:border-[var(--platform-accent)]";

function FieldRow({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--platform-muted)" }}>
          {label}
        </p>
        {children ?? (
          <p className="mt-0.5 truncate text-sm font-medium" style={{ color: "var(--platform-fg)" }} title={value}>
            {value || "—"}
          </p>
        )}
      </div>
    </div>
  );
}

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
  const [tableSearch, setTableSearch] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);

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
      client_id: "",
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
      setTableSearch("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("connections")
        .select("id, name, type, client_id, db_host, db_name, db_user, db_port, connection_tables, updated_at, original_file_name")
        .eq("id", connectionId)
        .single(),
      supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    ]).then(([connRes, clientsRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (connRes.error) {
        setError(connRes.error.message);
        setConn(null);
        return;
      }
      const row = connRes.data as ConnectionRow;
      setConn(row);
      setError(null);
      if (clientsRes.data) setClients(clientsRes.data as ClientOption[]);
      reset({
        name: row.name ?? "",
        type: row.type ?? "",
        client_id: row.client_id ?? "",
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
          client_id: values.client_id.trim() || null,
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
  const tables = Array.isArray(conn?.connection_tables) ? conn.connection_tables : [];
  const tableSearchLower = tableSearch.trim().toLowerCase();
  const filteredTables = tableSearchLower
    ? tables.filter((t) => String(t).toLowerCase().includes(tableSearchLower))
    : tables;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[640px] p-0 gap-0 overflow-hidden rounded-2xl border shadow-2xl"
        showCloseButton
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header con acento */}
        <div className="relative">
          <div
            className="absolute left-0 right-0 top-0 h-1"
            style={{ background: "var(--platform-gradient)" }}
          />
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
              >
                <Database className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                  {isView ? "Vista previa de la conexión" : "Configurar conexión"}
                </DialogTitle>
                <DialogDescription className="mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                  {isView
                    ? "Datos de la conexión en solo lectura."
                    : "Editá los parámetros y guardá los cambios."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 gap-4" style={{ color: "var(--platform-fg-muted)" }}>
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: "var(--platform-accent)" }} />
            <span className="text-sm font-medium">Cargando conexión…</span>
          </div>
        ) : error ? (
          <div
            className="mx-6 mb-6 rounded-xl border px-4 py-4 text-sm flex items-center gap-3"
            style={{
              borderColor: "rgba(248,113,113,0.35)",
              background: "var(--platform-surface)",
              color: "var(--platform-danger)",
            }}
          >
            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(248,113,113,0.15)" }}>
              <Database className="h-5 w-5" />
            </div>
            <span>{error}</span>
          </div>
        ) : conn ? (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
            <div className="px-6 pb-5 max-h-[65vh] overflow-y-auto">
              {/* Bloque: Datos de la conexión */}
              <div
                className="rounded-xl border p-4 mb-5"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--platform-fg-muted)" }}>
                  <Server className="h-3.5 w-3.5" />
                  Datos de la conexión
                </h3>

                {isView ? (
                  <div className="space-y-0 divide-y" style={{ borderColor: "var(--platform-border)" }}>
                    <FieldRow icon={Database} label="Nombre" value={conn.name} />
                    <FieldRow icon={FileText} label="Tipo" value={conn.type} />
                    <FieldRow
                      icon={Building2}
                      label="Cliente"
                      value={clients.find((c) => c.id === conn.client_id)?.company_name ?? (conn.client_id ? "—" : "Sin asignar")}
                    />
                    {!isExcel && (
                      <>
                        <FieldRow icon={Server} label="Host" value={conn.db_host ?? undefined} />
                        <FieldRow icon={Hash} label="Puerto" value={conn.db_port != null ? String(conn.db_port) : undefined} />
                        <FieldRow icon={Database} label="Base de datos" value={conn.db_name ?? undefined} />
                        <FieldRow icon={User} label="Usuario" value={conn.db_user ?? undefined} />
                      </>
                    )}
                    {isExcel && conn.original_file_name && (
                      <FieldRow icon={FileText} label="Archivo" value={conn.original_file_name} />
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                        Nombre
                      </label>
                      <Input
                        {...register("name", { required: "Completá el nombre" })}
                        placeholder="Ej. Ventas 2025"
                        className={inputClass}
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs" style={{ color: "var(--platform-danger)" }}>{errors.name.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                        Tipo
                      </label>
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
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                        Cliente
                      </label>
                      <Controller
                        name="client_id"
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            options={[
                              { value: "", label: "Ninguno" },
                              ...clients.map((c) => ({ value: c.id, label: c.company_name })),
                            ]}
                            placeholder="Asignar a cliente"
                            disablePortal
                          />
                        )}
                      />
                    </div>
                    {!isExcel && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                              Host
                            </label>
                            <Input {...register("db_host")} placeholder="Ej. localhost" className={inputClass} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                              Puerto
                            </label>
                            <Input {...register("db_port")} type="number" placeholder="3306" className={inputClass} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                            Base de datos
                          </label>
                          <Input {...register("db_name")} placeholder="Nombre de la base" className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--platform-muted)" }}>
                            Usuario
                          </label>
                          <Input {...register("db_user")} placeholder="Usuario de la base" className={inputClass} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Tablas para ETL */}
              {(conn.type === "firebird" || conn.type === "mysql" || conn.type === "postgres" || conn.type === "postgresql") && (
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
                        Tablas para ETL
                      </span>
                      {tables.length > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                        >
                          {tables.length}
                        </span>
                      )}
                    </div>
                    {onOpenTables && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenTables(connectionId!, conn.name, conn.type);
                        }}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                        style={{
                          border: "1px solid var(--platform-accent)",
                          color: "var(--platform-accent)",
                          background: "transparent",
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar tablas
                      </button>
                    )}
                  </div>
                  {tables.length > 0 ? (
                    <>
                      <div className="px-4 py-2 border-b" style={{ borderColor: "var(--platform-border)" }}>
                        <input
                          type="text"
                          placeholder="Buscar tabla…"
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30"
                          style={{
                            background: "var(--platform-bg-elevated)",
                            borderColor: "var(--platform-border)",
                            color: "var(--platform-fg)",
                          }}
                        />
                      </div>
                      <div
                        className="max-h-[220px] overflow-y-auto py-1"
                        style={{ color: "var(--platform-fg-muted)" }}
                      >
                        {filteredTables.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm">Ninguna tabla coincide con la búsqueda.</p>
                        ) : (
                          <ul className="space-y-0">
                            {filteredTables.map((t, i) => (
                              <li
                                key={i}
                                className="truncate px-4 py-1.5 text-xs font-mono transition-colors hover:bg-[var(--platform-surface-hover)]"
                                title={String(t)}
                              >
                                {String(t)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="px-4 py-5 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                      Ninguna tabla seleccionada. En el ETL se listarán todas las disponibles. Usá &quot;Editar tablas&quot; para elegir cuáles incluir.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-4 text-xs" style={{ color: "var(--platform-muted)" }}>
                Última actualización: {conn.updated_at ? new Date(conn.updated_at).toLocaleString() : "—"}
              </p>
            </div>

            <div
              className="flex flex-row justify-end gap-3 px-6 py-4 border-t shrink-0"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 px-5 rounded-xl text-sm font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30"
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
                  className="h-10 px-5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/50"
                  style={{
                    color: "var(--platform-accent-fg)",
                    background: "var(--platform-accent)",
                  }}
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
              )}
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
