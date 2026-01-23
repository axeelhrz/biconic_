"use client";

// Importamos 'useCallback' de React
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import ConnectionForm from "./ConnectionForm";
import { createClient } from "@/lib/supabase/client";
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

  const handleExcelUpload = async (file: File, connectionName: string) => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      // Validar extensión permitida
      const allowed = ["xlsx", "xls", "csv"] as const;
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      if (!fileExt || !allowed.includes(fileExt as any)) {
        throw new Error(
          "Formato no soportado. Sube un archivo .xlsx, .xls o .csv."
        );
      }

      const activeClientId = await getActiveClientId(supabase, user.id);
      const filePath = `${user.id}/${new Date().getTime()}.${fileExt}`;

      toast.info("Subiendo archivo de forma segura...");
      const { error: uploadError } = await supabase.storage
        .from("excel-uploads")
        .upload(filePath, file);
      if (uploadError)
        throw new Error(`Error al subir el archivo: ${uploadError.message}`);

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
      if (connectionError)
        throw new Error(
          `Error al crear la conexión: ${connectionError.message}`
        );

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
      if (metaError || !dataTableMeta)
        throw new Error("No se pudo crear el registro de metadatos.");

      const dataTableId = dataTableMeta.id;

      setCurrentImportId(dataTableId);
      setIsProcessing(true);

      const response = await fetch("/api/process-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: newConnectionId,
          dataTableId: dataTableId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "El servidor no pudo iniciar el proceso."
        );
      }
    } catch (err: any) {
      toast.error(err.message);
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
        />
      </DialogContent>
    </Dialog>
  );
}
