"use client";

import { AlertCircle, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as XLSX from "xlsx";
import { DialogClose } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, type SelectOption } from "../ui/Select";
import ImportStatus from "./importStatus"; // Importamos el componente de estado

function FormFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      className="mt-1.5 flex items-center gap-2 rounded-lg border py-2 px-3 text-sm"
      style={{
        color: "var(--platform-danger)",
        borderColor: "rgba(248, 113, 113, 0.25)",
        background: "var(--platform-surface)",
      }}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}

const CONNECTION_TYPE_OPTIONS: SelectOption[] = [
  { value: "mysql", label: "MySQL" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "firebird", label: "Firebird (Flexxus)" },
  { value: "excel", label: "Archivo Excel/CSV" },
];

type ConnectionFormValues = {
  type: string;
  connectionName: string;
  host: string;
  database: string;
  user: string;
  password: string;
  port?: number;
};

// NOTA: Se ha simplificado onExcelUpload para que coincida con lo que el padre provee.
type ConnectionFormProps = {
  defaultValues?: Partial<ConnectionFormValues>;
  onTestConnection?: (
    values: ConnectionFormValues
  ) => Promise<boolean> | boolean;
  onSubmit?: (values: ConnectionFormValues) => Promise<void> | void;
  onExcelUpload?: (
    file: File,
    connectionName: string,
    options: { parseMode: "strict" | "tolerant" | "mixed"; selectedSheet?: string }
  ) => Promise<void> | void;
  // Nuevas props para recibir el estado del proceso desde el diálogo padre
  isProcessing?: boolean;
  currentImportId?: string | null;
  onProcessFinished?: () => void;
  // Selector de cliente (admin): se muestra dentro del modal
  clientOptions?: SelectOption[];
  selectedClientId?: string;
  onClientIdChange?: (clientId: string) => void;
  clientsLoading?: boolean;
};

export default function ConnectionForm({
  defaultValues,
  onTestConnection,
  onSubmit,
  onExcelUpload,
  // Recibimos las nuevas props para controlar la UI
  isProcessing,
  currentImportId,
  onProcessFinished,
  clientOptions,
  selectedClientId = "",
  onClientIdChange,
  clientsLoading = false,
}: ConnectionFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    reset,
    watch,
  } = useForm<ConnectionFormValues>({
    defaultValues: {
      type: "",
      connectionName: "",
      host: "",
      database: "",
      user: "",
      password: "",
      port: undefined,
      ...defaultValues,
    },
    mode: "onBlur",
  });

  const [isExcelMode, setIsExcelMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [sheetInspectError, setSheetInspectError] = useState<string | null>(null);
  const [parseMode, setParseMode] = useState<"strict" | "tolerant" | "mixed">(
    "mixed"
  );
  // Este estado ahora solo controla el feedback inmediato del botón "Subiendo..."
  const [isUploading, setIsUploading] = useState(false);

  const connectionType = watch("type");

  useEffect(() => {
    if (defaultValues) {
      reset({
        type: defaultValues.type ?? "",
        connectionName: defaultValues.connectionName ?? "",
        host: defaultValues.host ?? "",
        database: defaultValues.database ?? "",
        user: defaultValues.user ?? "",
        password: defaultValues.password ?? "",
        port: defaultValues.port,
      });
    }
  }, [defaultValues, reset]);

  const onSubmitHandler = async (values: ConnectionFormValues) => {
    await onSubmit?.(values);
  };

  const onTestHandler = async () => {
    await onTestConnection?.(getValues());
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSheetInspectError(null);
      setAvailableSheets([]);
      setSelectedSheet("");
      try {
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (fileExt === "csv") {
          setAvailableSheets(["CSV"]);
          setSelectedSheet("CSV");
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheets = Array.isArray(workbook.SheetNames)
          ? workbook.SheetNames.filter(Boolean)
          : [];

        if (sheets.length === 0) {
          setSheetInspectError(
            "No se detectaron hojas en el archivo. Verificá el formato y volvé a intentar."
          );
          return;
        }

        setAvailableSheets(sheets);
        setSelectedSheet(sheets[0]);
      } catch {
        setSheetInspectError(
          "No se pudieron leer las hojas del archivo. Podés continuar y se usará la primera hoja disponible."
        );
      }
    }
  };

  const handleExcelUpload = async () => {
    if (!selectedFile) return;

    const connectionName = getValues("connectionName");
    if (!connectionName) {
      alert("Por favor ingrese un nombre para la conexión");
      return;
    }

    setIsUploading(true);
    try {
      // Llamamos a la función del padre, que manejará toda la lógica
      await onExcelUpload?.(selectedFile, connectionName, {
        parseMode,
        selectedSheet: selectedSheet || undefined,
      });
    } catch (error) {
      console.error("Error uploading Excel:", error);
      // El padre se encargará de mostrar los toasts de error
    }
    // No reseteamos `isUploading` a `false` porque `isProcessing` tomará el control
  };

  const isFirebird = connectionType === "firebird";
  useEffect(() => {
    setIsExcelMode(connectionType === "excel");
    if (connectionType !== "excel") {
      setSelectedFile(null);
      setAvailableSheets([]);
      setSelectedSheet("");
      setSheetInspectError(null);
      setParseMode("mixed");
    }
  }, [connectionType]);

  const inputClass =
    "w-full h-11 px-4 rounded-lg text-[15px] transition-colors border bg-[var(--platform-surface)] border-[var(--platform-border)] text-[var(--platform-fg)] placeholder:text-[var(--platform-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/30 focus:border-[var(--platform-accent)]";

  return (
    <div className="rounded-xl shadow-lg w-full max-w-[640px] mx-auto overflow-hidden border" style={{ background: "var(--platform-bg-elevated)", borderColor: "var(--platform-border)" }}>
      <div className="px-8 pt-8 pb-6 border-b flex justify-between items-start gap-4" style={{ borderColor: "var(--platform-border)" }}>
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--platform-fg)" }}>
            Nueva conexión
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            Configurá el tipo de base de datos y los datos de acceso.
          </p>
        </div>
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Cerrar"
            className="shrink-0 p-2 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--platform-fg-muted)" }}
          >
            <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 13.5L13.5 1.5M1.5 1.5L13.5 13.5" />
            </svg>
          </button>
        </DialogClose>
      </div>

      <form
        className="flex flex-col"
        onSubmit={handleSubmit(onSubmitHandler)}
      >
        <div className="px-8 py-6 space-y-5">
          {clientOptions && onClientIdChange && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                <Building2 className="h-4 w-4" />
                Asignar a cliente
              </label>
              {clientsLoading ? (
                <p className="text-sm py-2" style={{ color: "var(--platform-muted)" }}>Cargando clientes…</p>
              ) : (
                <Select
                  value={selectedClientId}
                  onChange={onClientIdChange}
                  options={clientOptions}
                  placeholder="Seleccionar cliente"
                  disablePortal
                />
              )}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="type" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                Tipo
              </label>
              <Controller
                name="type"
                control={control}
                rules={{ required: "Completá el tipo de conexión" }}
                render={({ field }) => (
                  <Select
                    id="type"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={CONNECTION_TYPE_OPTIONS}
                    placeholder="Seleccione tipo"
                    searchable
                    searchPlaceholder="Buscar tipo..."
                    disablePortal
                  />
                )}
              />
              <FormFieldError message={errors.type?.message} />
            </div>
            <div>
              <label htmlFor="connection-name" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                Nombre de la conexión
              </label>
              <Input
                type="text"
                id="connection-name"
                placeholder="Ej. Ventas 2025"
                className={inputClass}
                {...register("connectionName", { required: "Completá el nombre de la conexión" })}
              />
              <FormFieldError message={errors.connectionName?.message} />
            </div>
          </div>

        {isExcelMode && (
          <div className="border-2 border-dashed rounded-lg p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
            <div className="text-center">
              {isProcessing && currentImportId && onProcessFinished ? (
                <ImportStatus
                  dataTableId={currentImportId}
                  onProcessFinished={onProcessFinished}
                />
              ) : (
                <>
                  <div className="mb-4" style={{ color: "var(--platform-muted)" }}>
                    <svg
                      className="mx-auto h-12 w-12"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="excel-file" className="cursor-pointer">
                      <span className="text-[16px] font-medium" style={{ color: "var(--platform-accent)" }}>
                        Seleccionar archivo Excel o CSV
                      </span>
                      <input
                        id="excel-file"
                        type="file"
                        accept=".xlsx,.xls,.xlsm,.csv,.ods"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {selectedFile && (
                    <div className="mb-4 p-3 rounded border" style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)" }}>
                      <p className="text-sm" style={{ color: "var(--platform-fg)" }}>
                        <strong>Archivo seleccionado:</strong>{" "}
                        {selectedFile.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                        Tamaño: {(selectedFile.size / 1024 / 1024).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-left">
                    <div>
                      <label
                        htmlFor="parse-mode"
                        className="block text-xs font-medium mb-1"
                        style={{ color: "var(--platform-fg-muted)" }}
                      >
                        Modo de lectura
                      </label>
                      <select
                        id="parse-mode"
                        value={parseMode}
                        onChange={(e) =>
                          setParseMode(
                            e.target.value as "strict" | "tolerant" | "mixed"
                          )
                        }
                        className={inputClass}
                      >
                        <option value="mixed">Mixto (recomendado)</option>
                        <option value="strict">Estricto</option>
                        <option value="tolerant">Tolerante</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="sheet-name"
                        className="block text-xs font-medium mb-1"
                        style={{ color: "var(--platform-fg-muted)" }}
                      >
                        Hoja
                      </label>
                      <select
                        id="sheet-name"
                        value={selectedSheet}
                        onChange={(e) => setSelectedSheet(e.target.value)}
                        className={inputClass}
                        disabled={!selectedFile || availableSheets.length === 0}
                      >
                        {availableSheets.length === 0 ? (
                          <option value="">Se seleccionará automáticamente</option>
                        ) : (
                          availableSheets.map((sheet) => (
                            <option key={sheet} value={sheet}>
                              {sheet}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                  {sheetInspectError && (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--platform-danger)" }}
                    >
                      {sheetInspectError}
                    </p>
                  )}
                  <p
                    className="text-xs mt-2"
                    style={{ color: "var(--platform-fg-muted)" }}
                  >
                    Formatos soportados: .xlsx, .xls, .xlsm, .csv, .ods
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {!isExcelMode && (
          <>
            <div className="pt-2 border-t" style={{ borderColor: "var(--platform-border)" }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--platform-fg-muted)" }}>
                Datos del servidor
              </p>
              <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
                <div>
                  <label htmlFor="host" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                    Host
                  </label>
                  <Input
                    type="text"
                    id="host"
                    placeholder={isFirebird ? "Ej. mngservicios.flexxus.com.ar" : "Ej. localhost o IP"}
                    className={inputClass}
                    {...register("host", { required: "Completá el host" })}
                  />
                  <FormFieldError message={errors.host?.message} />
                </div>
                <div>
                  <label htmlFor="port" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                    Puerto
                  </label>
                  <Input
                    type="number"
                    id="port"
                    placeholder={isFirebird ? "15421" : "3306"}
                    className={inputClass}
                    {...register("port", {
                      valueAsNumber: true,
                      min: { value: 1, message: "Completá un puerto válido (1-65535)" },
                      max: { value: 65535, message: "Completá un puerto válido (1-65535)" },
                    })}
                  />
                  <FormFieldError message={errors.port?.message} />
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="database" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                  {isFirebird ? "Path / Nombre de base" : "Base de datos"}
                </label>
                <Input
                  type="text"
                  id="database"
                  placeholder={isFirebird ? "/ruta/a/base.fdb o alias" : "Nombre de la base"}
                  className={inputClass}
                  {...register("database", { required: "Completá la base de datos" })}
                />
                <FormFieldError message={errors.database?.message} />
              </div>
              <div>
                <label htmlFor="user" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                  Usuario
                </label>
                <Input
                  type="text"
                  id="user"
                  placeholder="Usuario de la base"
                  className={inputClass}
                  {...register("user", { required: "Completá el usuario" })}
                />
                <FormFieldError message={errors.user?.message} />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                Contraseña
              </label>
              <Input
                type="password"
                id="password"
                placeholder="Contraseña de acceso"
                className={inputClass}
                {...register("password", { required: "Completá la contraseña" })}
              />
              <FormFieldError message={errors.password?.message} />
            </div>
          </>
        )}
        </div>

        {/* Los botones ahora se ocultan durante el procesamiento del backend */}
        {!isProcessing && (
          <div className="px-8 py-6 border-t flex flex-col-reverse sm:flex-row sm:justify-end sm:items-center gap-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
            <DialogClose asChild>
              <button
                type="button"
                className="h-10 px-5 rounded-lg text-sm font-medium transition-colors border hover:opacity-90"
                style={{ color: "var(--platform-fg)", borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
              >
                Cancelar
              </button>
            </DialogClose>
            {!isExcelMode ? (
              <>
                <button
                  type="button"
                  onClick={onTestHandler}
                  className="h-10 px-5 rounded-lg text-sm font-medium transition-colors border hover:opacity-90"
                  style={{ color: "var(--platform-accent)", borderColor: "var(--platform-accent)", background: "transparent" }}
                >
                  Probar conexión
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 px-6 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 hover:opacity-90"
                  style={{ color: "var(--platform-accent-fg)", background: "var(--platform-accent)" }}
                >
                  {isSubmitting ? "Guardando..." : "Guardar"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleExcelUpload}
                disabled={!selectedFile || isUploading}
                className="h-10 px-6 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 hover:opacity-90"
                style={{ color: "var(--platform-accent-fg)", background: "var(--platform-accent)" }}
              >
                {isUploading ? "Subiendo..." : "Procesar archivo"}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
