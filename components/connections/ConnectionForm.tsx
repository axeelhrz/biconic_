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

  return (
    <div className="bg-white p-[30px] rounded-[10px] w-[698px] mx-auto flex flex-col gap-[15px]">
      <div className="flex justify-between items-start">
        <h1 className="text-[24px] font-semibold text-[#0F5F4C]">
          Nueva conexión
        </h1>
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Cerrar"
            className="flex items-center justify-center w-[30px] h-[30px] border-[1.25px] border-[#035664] rounded-full"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1.5 13.5L13.5 1.5M1.5 1.5L13.5 13.5"
                stroke="#035664"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </DialogClose>
      </div>

      <form
        className="flex flex-col gap-[15px]"
        onSubmit={handleSubmit(onSubmitHandler)}
      >
        <div>
          <label
            htmlFor="type"
            className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
          >
            Tipo
          </label>
          <div className="relative">
            <select
              id="type"
              className="w-full h-10 pl-[15px] pr-10 bg-white border border-[#D9DCE3] rounded-full appearance-none text-[16px] font-light text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
              {...register("type", { required: "Seleccione un tipo" })}
            >
              <option value="">Seleccione</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
              <option value="firebird">Firebird (Flexxus)</option>
              <option value="excel">Archivo Excel/CSV</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <svg
                className="h-5 w-5 text-[#9C9EA9]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            {errors.type && (
              <p className="mt-1 text-xs text-red-600">{errors.type.message}</p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="connection-name"
            className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
          >
            Nombre de la Conexión
          </label>
          <Input
            type="text"
            id="connection-name"
            placeholder="Ingrese"
            className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            {...register("connectionName", { required: "Ingrese un nombre" })}
          />
          {errors.connectionName && (
            <p className="mt-1 text-xs text-red-600">
              {errors.connectionName.message}
            </p>
          )}
        </div>

        {isExcelMode && (
          <div className="border-2 border-dashed border-[#D9DCE3] rounded-lg p-6 bg-gray-50">
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
            <div className="flex gap-x-[10px]">
              <div className="flex-1">
                <label
                  htmlFor="host"
                  className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
                >
                  Host
                </label>
                <Input
                  type="text"
                  id="host"
                  placeholder={isFirebird ? "Ej. mngservicios.flexxus.com.ar" : "Ingrese"}
                  className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  {...register("host", { required: "Ingrese el host" })}
                />
                {errors.host && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.host.message}
                  </p>
                )}
              </div>
              <div className="w-36">
                <label
                  htmlFor="port"
                  className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
                >
                  Puerto
                </label>
                <Input
                  type="number"
                  id="port"
                  placeholder={isFirebird ? "15421" : "3306/5432"}
                  className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  {...register("port", {
                    valueAsNumber: true,
                    min: { value: 1, message: "Puerto inválido" },
                    max: { value: 65535, message: "Puerto inválido" },
                  })}
                />
                {errors.port && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.port.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-x-[10px]">
              <div className="flex-1">
                <label
                  htmlFor="database"
                  className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
                >
                  {isFirebird ? "Path / Nombre de base" : "Base de Datos"}
                </label>
                <Input
                  type="text"
                  id="database"
                  placeholder={isFirebird ? "Ej. fbcdistribuciones" : "Ingrese"}
                  className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  {...register("database", {
                    required: "Ingrese la base de datos",
                  })}
                />
                {errors.database && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.database.message}
                  </p>
                )}
              </div>
              <div className="flex-1">
                <label
                  htmlFor="user"
                  className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
                >
                  Usuario
                </label>
                <Input
                  type="text"
                  id="user"
                  placeholder="Ingrese"
                  className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                  {...register("user", { required: "Ingrese el usuario" })}
                />
                {errors.user && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.user.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[14px] font-medium text-[#66687E] mb-[6px]"
              >
                Contraseña
              </label>
              <Input
                type="password"
                id="password"
                placeholder="Ingrese"
                className="w-full h-10 px-[15px] bg-white border border-[#D9DCE3] rounded-full text-[16px] font-light text-[#555555] placeholder:font-light placeholder:text-[#555555] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                {...register("password", { required: "Ingrese la contraseña" })}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>
          </>
        )}

        {/* Los botones ahora se ocultan durante el procesamiento del backend */}
        {!isProcessing && (
          <div className="flex justify-between items-center pt-2">
            {!isExcelMode ? (
              <button
                type="button"
                onClick={onTestHandler}
                className="h-[30px] py-[7px] px-4 border border-[#00030A] rounded-full text-[13px] font-medium text-[#00030A] flex items-center justify-center"
              >
                Probar conexión
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExcelUpload}
                disabled={!selectedFile || isUploading}
                className="h-[30px] py-[7px] px-4 border border-[#00030A] rounded-full text-[13px] font-medium text-[#00030A] flex items-center justify-center disabled:opacity-50"
              >
                {isUploading ? "Subiendo..." : "Procesar archivo"}
              </button>
            )}
            <div className="flex gap-x-[23px]">
              <DialogClose asChild>
                <button
                  type="button"
                  className="h-[30px] py-[7px] px-8 border border-[#00030A] rounded-full text-[13px] font-medium text-[#00030A] flex items-center justify-center"
                >
                  Cancelar
                </button>
              </DialogClose>
              {!isExcelMode && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-[30px] py-[7px] px-6 bg-[#19A180] text-[#FDFDFD] rounded-full text-[13px] font-medium flex items-center justify-center disabled:opacity-70"
                >
                  {isSubmitting ? "Guardando..." : "Guardar cambios"}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
