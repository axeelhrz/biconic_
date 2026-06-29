"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "../ui/dialog";
import { toast } from "sonner";
import ConnectionForm, { type ExcelUploadErrorInfo } from "./ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import { isOwnBackendEnabled } from "@/lib/api/backend-client";
import { uploadExcelViaOwnBackend } from "@/lib/excel-import/upload-excel-client";
import { safeJsonResponse } from "@/lib/safe-json-response";
import type { AppDbClient } from "@/lib/supabase/db-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type NewConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

const SHEET_INSPECTION_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export default function NewConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: NewConnectionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [excelError, setExcelError] = useState<ExcelUploadErrorInfo | null>(null);
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [connectionNameCreated, setConnectionNameCreated] = useState("");
  const [tablesFromMetadata, setTablesFromMetadata] = useState<
    { schema: string; name: string }[]
  >([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTableKeys, setSelectedTableKeys] = useState<Set<string>>(new Set());
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [savingTables, setSavingTables] = useState(false);

  const toStageError = useCallback(
    (
      stage: string,
      message: string,
      details?: string
    ): ExcelUploadErrorInfo => {
      const isPermissionError =
        /row-level security|permission denied|not authorized|violates/i.test(
          `${message} ${details || ""}`
        );

      if (isPermissionError) {
        return {
          stage,
          message:
            "No tienes permisos para completar esta acción. Verifica políticas/RLS para tu usuario.",
          details: details || message,
        };
      }

      return { stage, message, details };
    },
    []
  );

  const toPollingStageError = useCallback(
    (errorMessage?: string | null): ExcelUploadErrorInfo => {
      const raw = typeof errorMessage === "string" ? errorMessage.trim() : "";
      const match = raw.match(/^\[([a-z0-9_]+)\]\s*(.+)$/i);
      if (match) {
        const [, backendStage, backendMessage] = match;
        return toStageError(
          backendStage,
          backendMessage || "La importación falló durante el procesamiento.",
          raw
        );
      }

      return toStageError(
        "import_polling",
        "La importación falló durante el procesamiento.",
        raw || undefined
      );
    },
    [toStageError]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && isProcessing && !isFinished) {
        toast.info("Por favor, espere a que termine el procesamiento.");
        return;
      }
      if (!isOpen) {
        setTimeout(() => {
          setIsProcessing(false);
          setIsFinished(false);
          setCurrentImportId(null);
          setExcelError(null);
          setShowTableSelection(false);
          setCreatedConnectionId(null);
          setConnectionNameCreated("");
          setTablesFromMetadata([]);
          setSelectedTableKeys(new Set());
          setTableSearchQuery("");
          setSavingTables(false);
        }, 300);
      }
      onOpenChange(isOpen);
    },
    [isProcessing, isFinished, onOpenChange]
  );

  const handleSubmit = async (values: {
    type: string;
    connectionName: string;
    host: string;
    database: string;
    user: string;
    password: string;
    port?: number;
  }) => {
    if (
      !values.type ||
      !values.connectionName ||
      !values.host ||
      !values.database ||
      !values.user
    ) {
      toast.error("Completá todos los campos obligatorios.");
      return;
    }
    const normalizedType = String(values.type).toLowerCase();
    if (!["postgres", "postgresql", "mysql", "firebird"].includes(normalizedType)) {
      toast.error("Tipo de conexión no soportado.");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/connection/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: values.type,
          connectionName: values.connectionName,
          host: values.host.trim(),
          database: values.database.trim(),
          user: values.user.trim(),
          password: values.password || "",
          port: values.port != null ? Number(values.port) : undefined,
        }),
      });
      const data = await safeJsonResponse<{
        ok?: boolean;
        error?: string;
        data?: { id: string };
      }>(res);
      if (!data.ok) throw new Error(data.error || "Error al crear la conexión.");
      toast.success("Conexión creada. Seleccioná las tablas para JOIN y datos.");
      setCreatedConnectionId(data.data?.id ?? "");
      setConnectionNameCreated(values.connectionName);
      setShowTableSelection(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear la conexión.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTest = async (values: {
    type: string;
    host: string;
    database: string;
    user: string;
    password: string;
    port?: number;
  }) => {
    if (!values.host || !values.database || !values.user) {
      toast.error("Completá host, base de datos y usuario.");
      return false;
    }
    try {
      const res = await fetch("/api/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: values.type,
          host: values.host,
          database: values.database,
          user: values.user,
          password: values.password,
          port: values.port,
        }),
      });
      const data = await safeJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (data.ok) {
        toast.success("Conexión exitosa.");
        return true;
      }
      toast.error(data.error || "Error al conectar.");
      return false;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al probar la conexión.");
      return false;
    }
  };

  const getActiveClientId = async (
    supabase: AppDbClient,
    userId: string
  ): Promise<string> => {
    const { data: memberData } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (memberData?.client_id) {
      return memberData.client_id;
    }

    throw new Error("No se pudo encontrar un cliente asociado a tu cuenta.");
  };

  const handleExcelUpload = async (
    file: File,
    connectionName: string,
    options: { parseMode: "strict" | "tolerant" | "mixed"; selectedSheet?: string }
  ) => {
    try {
      setExcelError(null);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      const allowed = ["xlsx", "xls", "xlsm", "csv", "ods"] as const;
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      if (!fileExt || !allowed.includes(fileExt as (typeof allowed)[number])) {
        throw new Error(
          "Formato no soportado. Sube un archivo .xlsx, .xls, .xlsm, .csv u .ods."
        );
      }

      const activeClientId = await getActiveClientId(supabase, user.id);

      let newConnectionId: string;
      let dataTableId: string;

      if (isOwnBackendEnabled()) {
        toast.info("Subiendo archivo de forma segura...");
        const uploaded = await uploadExcelViaOwnBackend({
          file,
          connectionName,
          clientId: activeClientId,
        });
        newConnectionId = uploaded.connectionId;
        dataTableId = uploaded.dataTableId;
      } else {
        const filePath = `${user.id}/${new Date().getTime()}.${fileExt}`;

        toast.info("Subiendo archivo de forma segura...");
        const { error: uploadError } = await supabase.storage
          .from("excel-uploads")
          .upload(filePath, file);
        if (uploadError) {
          throw toStageError(
            "upload_storage",
            "Error al subir el archivo.",
            uploadError.message
          );
        }

        const { data: newConnection, error: connectionError } = await supabase
          .from("connections")
          .insert({
            name: connectionName,
            user_id: user.id,
            client_id: activeClientId,
            type: "excel_file",
            storage_object_path: filePath,
            original_file_name: file.name,
          })
          .select("id")
          .single();
        if (connectionError) {
          throw toStageError(
            "insert_connection",
            "Error al crear la conexión.",
            connectionError.message
          );
        }

        newConnectionId = newConnection.id;
        const { data: dataTableMeta, error: metaError } = await supabase
          .from("data_tables")
          .insert({
            connection_id: newConnectionId,
            import_status: "pending",
            physical_table_name: `import_${newConnectionId.replaceAll("-", "_")}`,
          })
          .select("id")
          .single();
        if (metaError || !dataTableMeta) {
          throw toStageError(
            "insert_data_table",
            "No se pudo crear el registro de metadatos.",
            metaError?.message
          );
        }

        dataTableId = dataTableMeta.id;
      }

      let selectedSheet = options.selectedSheet;
      const wantsAllSheets = selectedSheet === "__ALL__";
      if (
        !wantsAllSheets &&
        fileExt !== "csv" &&
        file.size <= SHEET_INSPECTION_MAX_SIZE_BYTES
      ) {
        const sheetsRes = await fetch("/api/process-excel/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: newConnectionId }),
        });

        if (sheetsRes.ok) {
          const sheetsData = await safeJsonResponse<{
            sheets?: string[];
            defaultSheet?: string;
            degraded?: boolean;
            warning?: string;
          }>(sheetsRes);
          if (sheetsData.degraded && sheetsData.warning) {
            toast.warning(sheetsData.warning);
          }
          const availableSheets = Array.isArray(sheetsData.sheets)
            ? sheetsData.sheets
            : [];
          if (
            selectedSheet &&
            availableSheets.length > 0 &&
            !availableSheets.includes(selectedSheet)
          ) {
            selectedSheet = sheetsData.defaultSheet || availableSheets[0];
            toast.warning(
              "La hoja elegida no existe en el archivo subido. Se usará la hoja por defecto."
            );
          } else if (!selectedSheet && availableSheets.length > 0) {
            selectedSheet = sheetsData.defaultSheet || availableSheets[0];
          }
        }
      } else if (!wantsAllSheets && fileExt !== "csv") {
        selectedSheet = undefined;
      }

      setCurrentImportId(dataTableId);
      setIsProcessing(true);

      const response = await fetch("/api/process-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: newConnectionId,
          dataTableId: dataTableId,
          parseMode: options.parseMode || "mixed",
          selectedSheet: selectedSheet || null,
        }),
      });

      if (!response.ok) {
        const errorData = await safeJsonResponse<{
          error?: string;
          stage?: string;
          details?: string;
        }>(response);
        throw toStageError(
          errorData.stage || "process_excel_start",
          errorData.error || "El servidor no pudo iniciar el proceso.",
          errorData.details
        );
      }
    } catch (err: unknown) {
      const staged =
        err instanceof Error &&
        "stage" in err &&
        typeof (err as Error & { stage?: unknown }).stage === "string";
      const parsed = staged
        ? toStageError((err as Error & { stage: string }).stage, err.message)
        : toStageError(
            "unknown",
            "Error inesperado durante la carga.",
            err instanceof Error ? err.message : String(err)
          );
      setExcelError(parsed);
      toast.error(parsed.message);
      setIsProcessing(false);
      setCurrentImportId(null);
    }
  };

  const handleProcessFinished = useCallback(
    (result: { status: "completed" | "failed"; errorMessage?: string | null }) => {
      if (result.status === "failed") {
        setIsProcessing(false);
        setExcelError(toPollingStageError(result.errorMessage));
        return;
      }

      if (isFinished) return;

      setIsFinished(true);
      setIsProcessing(false);
      onCreated?.();

      setTimeout(() => {
        handleOpenChange(false);
      }, 2000);
    },
    [isFinished, onCreated, handleOpenChange, toPollingStageError]
  );

  useEffect(() => {
    if (!showTableSelection || !createdConnectionId) return;
    setLoadingTables(true);
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: createdConnectionId }),
    })
      .then((r) =>
        safeJsonResponse<{
          ok?: boolean;
          metadata?: { tables?: { schema: string; name: string }[] };
          error?: string;
        }>(r)
      )
      .then((data) => {
        if (data.ok && Array.isArray(data.metadata?.tables)) {
          const tables = data.metadata.tables;
          setTablesFromMetadata(tables);
          setSelectedTableKeys(
            new Set(tables.map((t) => `${t.schema}.${t.name}`))
          );
        } else {
          setTablesFromMetadata([]);
          toast.error(
            data.error ||
              "No se pudieron cargar las tablas. Podés configurarlas manualmente en Conexiones."
          );
        }
      })
      .catch(() => {
        setTablesFromMetadata([]);
        toast.error("Error al cargar las tablas de la conexión.");
      })
      .finally(() => setLoadingTables(false));
  }, [showTableSelection, createdConnectionId]);

  const toggleTable = (key: string) => {
    setSelectedTableKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllTables = () =>
    setSelectedTableKeys(
      new Set(tablesFromMetadata.map((t) => `${t.schema}.${t.name}`))
    );
  const deselectAllTables = () => setSelectedTableKeys(new Set());

  const handleTableSelectionDone = async () => {
    if (!createdConnectionId) {
      setShowTableSelection(false);
      handleOpenChange(false);
      return;
    }
    setSavingTables(true);
    try {
      const supabase = createClient();
      const connectionTablesList = Array.from(selectedTableKeys);
      const { error } = await supabase
        .from("connections")
        .update({ connection_tables: connectionTablesList })
        .eq("id", createdConnectionId);
      if (error) throw error;
      toast.success(
        connectionTablesList.length > 0
          ? `${connectionTablesList.length} tabla(s) guardada(s).`
          : "Conexión guardada. Podés configurar tablas después en Conexiones."
      );
      setShowTableSelection(false);
      onCreated?.();
      handleOpenChange(false);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "No se pudieron guardar las tablas"
      );
    } finally {
      setSavingTables(false);
    }
  };

  if (showTableSelection && createdConnectionId) {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => !isOpen && handleTableSelectionDone()}
      >
        <DialogContent
          className="sm:max-w-[560px] max-h-[85vh] flex flex-col gap-4"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Tablas para JOIN y datos</DialogTitle>
            <DialogDescription>
              Seleccioná las tablas de &quot;{connectionNameCreated}&quot; que vas a
              usar en el ETL. En Firebird podés omitir esto y cargarlas manualmente
              si el listado tarda demasiado.
            </DialogDescription>
          </DialogHeader>
          {loadingTables ? (
            <p className="text-sm text-muted-foreground">Cargando tablas…</p>
          ) : tablesFromMetadata.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se encontraron tablas automáticamente. Usá Conexiones → Tablas para
              ETL para agregar nombres como PUBLIC.VENTAS.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  placeholder="Buscar tabla…"
                  value={tableSearchQuery}
                  onChange={(e) => setTableSearchQuery(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-md border px-3 py-2 text-sm bg-background"
                />
                <Button type="button" variant="outline" size="sm" onClick={selectAllTables}>
                  Seleccionar todas
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={deselectAllTables}>
                  Quitar todas
                </Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-[320px] p-2 space-y-1">
                {tablesFromMetadata
                  .filter(
                    (t) =>
                      !tableSearchQuery.trim() ||
                      `${t.schema}.${t.name}`
                        .toLowerCase()
                        .includes(tableSearchQuery.trim().toLowerCase())
                  )
                  .map((t) => {
                    const key = `${t.schema}.${t.name}`;
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/60",
                          selectedTableKeys.has(key) && "bg-muted/80"
                        )}
                      >
                        <Checkbox
                          checked={selectedTableKeys.has(key)}
                          onCheckedChange={() => toggleTable(key)}
                        />
                        <span className="text-sm font-medium">{key}</span>
                      </label>
                    );
                  })}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={handleTableSelectionDone} disabled={savingTables}>
              {savingTables ? "Guardando…" : "Listo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="p-0 border-0 shadow-none bg-transparent sm:max-w-[740px]"
      >
        <DialogTitle className="sr-only">
          {isProcessing ? "Procesando Conexión" : "Nueva Conexión"}
        </DialogTitle>

        <ConnectionForm
          onExcelUpload={handleExcelUpload}
          isProcessing={isProcessing}
          currentImportId={currentImportId}
          onProcessFinished={handleProcessFinished}
          onSubmit={handleSubmit}
          onTestConnection={handleTest}
          excelError={excelError}
          onClearExcelError={() => setExcelError(null)}
        />
      </DialogContent>
    </Dialog>
  );
}
