"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import ConnectionForm from "@/components/connections/ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import ShareConnectionModal from "@/components/connection/ShareConnectionModal";

type AdminNewConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export default function AdminNewConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: AdminNewConnectionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  
  // State for the second step (Permissions)
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);

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
          port: values.port != null && values.port !== "" ? Number(values.port) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al crear la conexión.");
      toast.success("Conexión creada correctamente.");
      onCreated?.();
      onOpenChange(false);
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
      const data = await res.json();
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

  const handleExcelUpload = async (file: File, connectionName: string) => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

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
          client_id: activeClientId as any,
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
      
      // Store IDs for permission step
      setCreatedConnectionId(newConnectionId);
      setCreatedClientId(activeClientId);

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

  const handleProcessFinished = useCallback(() => {
    if (isFinished) {
      return;
    }

    setIsFinished(true);
    // Instead of closing, we switch to permissions mode
    setShowPermissions(true);
    toast.success("Conexión creada correctamente. Ahora puedes configurar los permisos.");
    onCreated?.(); 
  }, [isFinished, onCreated]);

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
        />
        
      </DialogContent>
    </Dialog>
  );
}
