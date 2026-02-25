"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { DialogClose } from "../ui/dialog";
import { Input } from "../ui/input";
import ImportStatus from "./importStatus"; // Importamos el componente de estado

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
  onExcelUpload?: (file: File, connectionName: string) => Promise<void> | void;
  // Nuevas props para recibir el estado del proceso desde el diálogo padre
  isProcessing?: boolean;
  currentImportId?: string | null;
  onProcessFinished?: () => void;
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
}: ConnectionFormProps) {
  const {
    register,
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
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
      await onExcelUpload?.(selectedFile, connectionName);
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
    }
  }, [connectionType]);

  const inputClass =
    "w-full h-11 px-4 bg-white border border-[#D9DCE3] rounded-lg text-[15px] text-[#1a1a1a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0F5F4C]/30 focus:border-[#0F5F4C] transition-colors";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] w-full max-w-[640px] mx-auto overflow-hidden">
      <div className="px-8 pt-8 pb-6 border-b border-[#e2e8f0] flex justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#0F172a] tracking-tight">
            Nueva conexión
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Configurá el tipo de base de datos y los datos de acceso.
          </p>
        </div>
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Cerrar"
            className="shrink-0 p-2 rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0F172a] transition-colors"
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
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-[#334155] mb-1.5">
                Tipo
              </label>
              <div className="relative">
                <select
                  id="type"
                  className={inputClass + " pr-10 appearance-none cursor-pointer"}
                  {...register("type", { required: "Seleccione un tipo" })}
                >
                  <option value="">Seleccione tipo</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="firebird">Firebird (Flexxus)</option>
                  <option value="excel">Archivo Excel/CSV</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-5 w-5 text-[#94a3b8]" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              {errors.type && (
                <p className="mt-1 text-xs text-red-600">{errors.type.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="connection-name" className="block text-sm font-medium text-[#334155] mb-1.5">
                Nombre de la conexión
              </label>
              <Input
                type="text"
                id="connection-name"
                placeholder="Ej. Ventas 2025"
                className={inputClass}
                {...register("connectionName", { required: "Ingrese un nombre" })}
              />
              {errors.connectionName && (
                <p className="mt-1 text-xs text-red-600">{errors.connectionName.message}</p>
              )}
            </div>
          </div>

        {isExcelMode && (
          <div className="border-2 border-dashed border-[#e2e8f0] rounded-lg p-6 bg-[#f8fafc]">
            <div className="text-center">
              {isProcessing && currentImportId && onProcessFinished ? (
                <ImportStatus
                  dataTableId={currentImportId}
                  onProcessFinished={onProcessFinished}
                />
              ) : (
                <>
                  <div className="mb-4">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
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
                      <span className="text-[16px] font-medium text-[#0F5F4C]">
                        Seleccionar archivo Excel o CSV
                      </span>
                      <input
                        id="excel-file"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {selectedFile && (
                    <div className="mb-4 p-3 bg-white rounded border">
                      <p className="text-sm text-gray-600">
                        <strong>Archivo seleccionado:</strong>{" "}
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Tamaño: {(selectedFile.size / 1024 / 1024).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Formatos soportados: .xlsx, .xls, .csv
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {!isExcelMode && (
          <>
            <div className="pt-2 border-t border-[#e2e8f0]">
              <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider mb-4">
                Datos del servidor
              </p>
              <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
                <div>
                  <label htmlFor="host" className="block text-sm font-medium text-[#334155] mb-1.5">
                    Host
                  </label>
                  <Input
                    type="text"
                    id="host"
                    placeholder={isFirebird ? "Ej. mngservicios.flexxus.com.ar" : "Ej. localhost o IP"}
                    className={inputClass}
                    {...register("host", { required: "Ingrese el host" })}
                  />
                  {errors.host && (
                    <p className="mt-1 text-xs text-red-600">{errors.host.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="port" className="block text-sm font-medium text-[#334155] mb-1.5">
                    Puerto
                  </label>
                  <Input
                    type="number"
                    id="port"
                    placeholder={isFirebird ? "15421" : "3306"}
                    className={inputClass}
                    {...register("port", {
                      valueAsNumber: true,
                      min: { value: 1, message: "Puerto inválido" },
                      max: { value: 65535, message: "Puerto inválido" },
                    })}
                  />
                  {errors.port && (
                    <p className="mt-1 text-xs text-red-600">{errors.port.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="database" className="block text-sm font-medium text-[#334155] mb-1.5">
                  {isFirebird ? "Path / Nombre de base" : "Base de datos"}
                </label>
                <Input
                  type="text"
                  id="database"
                  placeholder={isFirebird ? "/ruta/a/base.fdb o alias" : "Nombre de la base"}
                  className={inputClass}
                  {...register("database", { required: "Ingrese la base de datos" })}
                />
                {errors.database && (
                  <p className="mt-1 text-xs text-red-600">{errors.database.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="user" className="block text-sm font-medium text-[#334155] mb-1.5">
                  Usuario
                </label>
                <Input
                  type="text"
                  id="user"
                  placeholder="Usuario de la base"
                  className={inputClass}
                  {...register("user", { required: "Ingrese el usuario" })}
                />
                {errors.user && (
                  <p className="mt-1 text-xs text-red-600">{errors.user.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#334155] mb-1.5">
                Contraseña
              </label>
              <Input
                type="password"
                id="password"
                placeholder="Contraseña de acceso"
                className={inputClass}
                {...register("password", { required: "Ingrese la contraseña" })}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>
          </>
        )}

        {/* Los botones ahora se ocultan durante el procesamiento del backend */}
        {!isProcessing && (
          <div className="px-8 py-6 border-t border-[#e2e8f0] bg-[#f8fafc] flex flex-col-reverse sm:flex-row sm:justify-end sm:items-center gap-3">
            <DialogClose asChild>
              <button
                type="button"
                className="h-10 px-5 rounded-lg text-sm font-medium text-[#475569] bg-white border border-[#e2e8f0] hover:bg-[#f1f5f9] transition-colors"
              >
                Cancelar
              </button>
            </DialogClose>
            {!isExcelMode ? (
              <>
                <button
                  type="button"
                  onClick={onTestHandler}
                  className="h-10 px-5 rounded-lg text-sm font-medium text-[#0F5F4C] bg-white border border-[#0F5F4C] hover:bg-[#0F5F4C]/5 transition-colors"
                >
                  Probar conexión
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 px-6 rounded-lg text-sm font-medium text-white bg-[#0F5F4C] hover:bg-[#0d5343] disabled:opacity-70 transition-colors"
                >
                  {isSubmitting ? "Guardando..." : "Guardar"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleExcelUpload}
                disabled={!selectedFile || isUploading}
                className="h-10 px-6 rounded-lg text-sm font-medium text-white bg-[#0F5F4C] hover:bg-[#0d5343] disabled:opacity-70 transition-colors"
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
