"use client";

import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import ConnectionForm, { type ExcelUploadErrorInfo } from "@/components/connections/ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import ShareConnectionModal from "@/components/connection/ShareConnectionModal";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/components/ui/Select";

type ClientOption = { id: string; company_name: string };

type AdminNewConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

const SHEET_INSPECTION_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export default function AdminNewConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: AdminNewConnectionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  
  // State for the second step (Permissions - Excel)
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  // State for DB connection: step 2 = select tables for JOIN/datos
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [connectionNameCreated, setConnectionNameCreated] = useState<string>("");
  const [tablesFromMetadata, setTablesFromMetadata] = useState<{ schema: string; name: string }[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTableKeys, setSelectedTableKeys] = useState<Set<string>>(new Set());
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [excelError, setExcelError] = useState<ExcelUploadErrorInfo | null>(null);

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

  useEffect(() => {
    if (!open) return;
    setClientsLoading(true);
    const supabase = createClient();
    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setClients(data as ClientOption[]);
        setClientsLoading(false);
      });
  }, [open]);

  const clientOptions: SelectOption[] = [
    { value: "", label: "Ninguno" },
    ...clients.map((c) => ({ value: c.id, label: c.company_name })),
  ];

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && isProcessing && !isFinished) {
        toast.info("Por favor, espere a que termine el procesamiento.");
        return;
      }
      if (!isOpen) {
        // Reset full state on close
        setTimeout(() => {
          setIsProcessing(false);
          setIsFinished(false);
          setCurrentImportId(null);
          setCreatedConnectionId(null);
          setCreatedClientId(null);
          setShowPermissions(false);
          setShowTableSelection(false);
          setTablesFromMetadata([]);
          setSelectedTableKeys(new Set());
          setTableSearchQuery("");
          setSavingTables(false);
          setConnectionNameCreated("");
          setSelectedClientId("");
          setExcelError(null);
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
    if (!values.type || !values.connectionName || !values.host || !values.database || !values.user) {
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
          client_id: selectedClientId.trim() || undefined,
        }),
      });
      const data = await safeJsonResponse<{ ok?: boolean; error?: string; data?: { id: string } }>(res);
      if (!data.ok) throw new Error(data.error || "Error al crear la conexión.");
      toast.success("Conexión creada correctamente. Seleccioná las tablas para JOIN y datos.");
      setCreatedConnectionId(data.data?.id ?? "");
      setConnectionNameCreated(values.connectionName);
      setShowTableSelection(true);
      // onCreated se llama al hacer clic en "Listo" para que la tabla se refresque entonces
    } catch (err: any) {
      toast.error(err?.message || "Error al crear la conexión.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTest = async (values: any) => {
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
      const data = await safeJsonResponse(res);
      if (data.ok) {
        toast.success("Conexión exitosa.");
        return true;
      }
      toast.error(data.error || "Error al conectar.");
      return false;
    } catch (err: any) {
      toast.error(err?.message || "Error al probar la conexión.");
      return false;
    }
  };

  const getActiveClientId = async (
    supabase: SupabaseClient,
    userId: string
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle(); // Usamos maybeSingle para no lanzar error si no hay record

    if (data?.client_id) {
        return data.client_id;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("app_role")
        .eq("id", userId)
        .single();
    
    if (profile?.app_role === 'APP_ADMIN') {
        return null; // Admin sin cliente
    }

    // Si no es admin y no tiene cliente, error.
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
      if (!fileExt || !allowed.includes(fileExt as any)) {
        throw new Error(
          "Formato no soportado. Sube un archivo .xlsx, .xls, .xlsm, .csv u .ods."
        );
      }

      const activeClientId = selectedClientId.trim() || (await getActiveClientId(supabase, user.id));
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
          client_id: activeClientId as any,
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

      const newConnectionId = newConnection.id;
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

      const dataTableId = dataTableMeta.id;

      let selectedSheet = options.selectedSheet;
      const wantsAllSheets = selectedSheet === "__ALL__";
      if (!wantsAllSheets && fileExt !== "csv" && file.size <= SHEET_INSPECTION_MAX_SIZE_BYTES) {
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
      
      // Store IDs for permission step
      setCreatedConnectionId(newConnectionId);
      setCreatedClientId(activeClientId);

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
      const fallback = toStageError(
        "unknown",
        "Error inesperado durante la carga.",
        err instanceof Error ? err.message : String(err)
      );
      const parsed =
        typeof err === "object" && err !== null && "stage" in err && "message" in err
          ? (err as ExcelUploadErrorInfo)
          : fallback;
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
      setShowPermissions(true);
      toast.success("Conexión creada correctamente. Ahora puedes configurar los permisos.");
      onCreated?.();
    },
    [isFinished, onCreated, toPollingStageError]
  );

  // Fetch tables when step 2 (table selection) is shown for DB connection
  useEffect(() => {
    if (!showTableSelection || !createdConnectionId) return;
    setLoadingTables(true);
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: createdConnectionId }),
    })
      .then((r) => safeJsonResponse<{ ok?: boolean; metadata?: { tables?: { schema: string; name: string }[] }; error?: string }>(r))
      .then((data) => {
        if (data.ok && Array.isArray(data.metadata?.tables)) {
          const tables = data.metadata.tables;
          setTablesFromMetadata(tables);
          setSelectedTableKeys(new Set(tables.map((t) => `${t.schema}.${t.name}`)));
        } else {
          setTablesFromMetadata([]);
          toast.error(data.error || "No se pudieron cargar las tablas.");
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
  const selectAllTables = () => setSelectedTableKeys(new Set(tablesFromMetadata.map((t) => `${t.schema}.${t.name}`)));
  const deselectAllTables = () => setSelectedTableKeys(new Set());
  const [savingTables, setSavingTables] = useState(false);
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
          ? `${connectionTablesList.length} tabla(s) guardada(s). En el ETL solo se verán estas tablas para esta conexión.`
          : "Conexión guardada. Podés configurar tablas después en Conexiones → Tablas para ETL."
      );
      setShowTableSelection(false);
      onCreated?.();
      handleOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron guardar las tablas");
    } finally {
      setSavingTables(false);
    }
  };

  // Step 2 for DB: list of tables to use for JOIN and data
  if (showTableSelection && createdConnectionId) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleTableSelectionDone()}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col gap-4" showCloseButton>
          <DialogHeader>
            <DialogTitle>Tablas para JOIN y datos</DialogTitle>
            <DialogDescription>
              Seleccioná las tablas de &quot;{connectionNameCreated}&quot; que vas a usar para hacer JOIN y extraer datos.
            </DialogDescription>
          </DialogHeader>
          {loadingTables ? (
            <p className="text-sm text-muted-foreground">Cargando tablas…</p>
          ) : tablesFromMetadata.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron tablas o el tipo de conexión no soporta listado aún.</p>
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
                  .filter((t) => !tableSearchQuery.trim() || `${t.schema}.${t.name}`.toLowerCase().includes(tableSearchQuery.trim().toLowerCase()))
                  .map((t) => {
                  const key = `${t.schema}.${t.name}`;
                  const qualified = `${t.schema}.${t.name}`;
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
                      <span className="text-sm font-medium">{qualified}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTableKeys.size} de {tablesFromMetadata.length} tablas seleccionadas. Estas tablas estarán disponibles para JOIN y como fuente de datos en el ETL.
              </p>
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

  // If permissions mode is active, we render a modified version of the share modal CONTENT
  // OR we simply render the ShareConnectionModal on top? 
  // It's cleaner to just swap the content within THIS dialog if possible, or render the ShareConnectionModal.
  // Given ShareConnectionModal controls its own Dialog, we might need to close this one and open that one, 
  // but to keep it seamless "in the same flow", we can just conditionally render the content.
  // HOWEVER, ShareConnectionModal wraps everything in <Dialog>. 
  // To avoid reuse issues (since user said "create new one"), I will instantiate ShareConnectionModal logic here or simply render it.
  
  // Since ShareConnectionModal is exported as a component that renders a Dialog, 
  // we can't easily nest it inside another DialogContent without UI glitches (nested dialogs).
  // Strategy: When showPermissions is true, we hide the "Form" part and show "Permissions" part. 
  // But wait, ShareConnectionModal *is* a Dialog.
  // I will just open ShareConnectionModal when this finishes? No, better to have it inline.

  // Let's copy the internal logic of ShareConnectionModal but adapt it to be just content, NOT a Dialog.
  // Wait, reusing code is discouraged ("sin reutilizar codigo"). But duplicating logic is allowed.
  
  if (showPermissions && createdConnectionId && createdClientId) {
       // Render the external component? 
       // User said "Create a new one identical and add functionality".
       // So I am in AdminNewConnectionDialog. I will delegate to ShareConnectionModal by passing open=true to it?
       // Let's do that. But we need to close the "creation" UI visually or replace it.
       // Actually, maybe it's better to just chain them. 
       // When creation finishes -> close this -> open Share Modal.
       // But user said "New modal identical... add functionality".
       // Maybe they want ONE modal that does both.
       
       // I'll adopt the strategy of rendering the ShareConnectionModal *instead* of this one when finished.
       // But wait, the user instructions are: "use a modal equal to creation... add functionality to handle permissions".
       // This implies the permissions should be part of the creation flow (e.g. "Step 2").
       
       return (
           <ShareConnectionModal 
               open={true} 
               onOpenChange={(val) => !val && handleOpenChange(false)}
               connectionId={createdConnectionId}
               clientId={createdClientId}
           />
       );
       // Wait, ShareConnectionModal has its own <Dialog> wrapper. If I return it here, 
       // it will render a Dialog inside... where? If I return it from the component it's fine.
       // BUT, AdminNewConnectionDialog creates a Dialog. 
       // If I render ShareConnectionModal, I am nesting dialogs or I have two open.
       // I should probably CLOSE the local <Dialog> (by returning null for it) and return <ShareConnectionModal> ?
       // No, React components return one tree.
       
       // Let's try this: The component returns EITHER the creation dialog OR the share dialog.
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
          clientOptions={clientOptions}
          selectedClientId={selectedClientId}
          onClientIdChange={setSelectedClientId}
          clientsLoading={clientsLoading}
          excelError={excelError}
          onClearExcelError={() => setExcelError(null)}
        />
        
      </DialogContent>
    </Dialog>
  );
}
