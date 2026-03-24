"use client";

// Importamos 'useCallback' de React
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import ConnectionForm, { type ExcelUploadErrorInfo } from "./ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import { safeJsonResponse } from "@/lib/safe-json-response";
import type { SupabaseClient } from "@supabase/supabase-js";

type NewConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export default function NewConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: NewConnectionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [excelError, setExcelError] = useState<ExcelUploadErrorInfo | null>(null);

  const toStageError = (
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
  };

  // Envolvemos esta función en useCallback para estabilizarla y evitar re-renders innecesarios
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
        }, 300);
      }
      onOpenChange(isOpen);
    },
    [isProcessing, isFinished, onOpenChange]
  );

  const handleSubmit = async (values: any) => {
    toast.warning("Funcionalidad no implementada.");
  };

  const handleTest = async (values: any) => {
    toast.warning("Funcionalidad no implementada.");
    return false;
  };

  const getActiveClientId = async (
    supabase: SupabaseClient,
    userId: string
  ): Promise<string> => {
    // 1. Intentamos obtener el cliente asociado
    const { data: memberData } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (memberData?.client_id) {
      return memberData.client_id;
    }

    // 2. Si no hay asociación, error directo (no se permite null en esta pantalla)
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

      // Validar extensión permitida
      const allowed = ["xlsx", "xls", "xlsm", "csv", "ods"] as const;
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      if (!fileExt || !allowed.includes(fileExt as any)) {
        throw new Error(
          "Formato no soportado. Sube un archivo .xlsx, .xls, .xlsm, .csv u .ods."
        );
      }

      const activeClientId = await getActiveClientId(supabase, user.id);
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
      if (fileExt !== "csv") {
        const sheetsRes = await fetch("/api/process-excel/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: newConnectionId }),
        });

        if (sheetsRes.ok) {
          const sheetsData = await safeJsonResponse<{
            sheets?: string[];
            defaultSheet?: string;
          }>(sheetsRes);
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

  // ================== LA CORRECCIÓN CLAVE ESTÁ AQUÍ ==================
  const handleProcessFinished = useCallback(() => {
    // EL "GATEKEEPER": Si el proceso ya está marcado como finalizado,
    // salimos inmediatamente para no ejecutar la lógica de nuevo.
    if (isFinished) {
      return;
    }

    // Si es la primera vez que se llama, marcamos como finalizado
    // y ejecutamos la lógica de cierre.
    setIsFinished(true);
    onCreated?.();

    setTimeout(() => {
      // Usamos la versión estable de handleOpenChange
      handleOpenChange(false);
    }, 2000);
  }, [isFinished, onCreated, handleOpenChange]);
  // ====================================================================

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
