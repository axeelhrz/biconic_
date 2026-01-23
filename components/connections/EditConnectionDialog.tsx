"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import ConnectionForm from "./ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type EditConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  onUpdated?: () => void;
};

type FormValues = {
  type: string;
  connectionName: string;
  host: string;
  database: string;
  user: string;
  password: string;
  port?: number;
};

export default function EditConnectionDialog({
  open,
  onOpenChange,
  connectionId,
  onUpdated,
}: EditConnectionDialogProps) {
  const [initialValues, setInitialValues] =
    useState<Partial<FormValues> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchConnection() {
      if (!open || !connectionId) {
        setInitialValues(null);
        return;
      }
      try {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from("connections")
          .select("id, name, db_host, db_name, db_user, db_port, type")
          .eq("id", connectionId)
          .single();

        console.log("Fetched connection data:", data, error);

        if (error) throw error;

        if (isMounted) {
          setInitialValues({
            type: (data as any)?.type ?? "",
            connectionName: (data as any)?.name ?? "",
            host: (data as any)?.db_host ?? "",
            database: (data as any)?.db_name ?? "",
            user: (data as any)?.db_user ?? "",
            password: "", // password se maneja por secreto, no editable aquí
            port: (data as any)?.db_port,
          });
        }
      } catch (err: any) {
        toast.error(err?.message || "No se pudo cargar la conexión");
        console.error("Fetch connection failed:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchConnection();
    return () => {
      isMounted = false;
    };
  }, [open, connectionId]);

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!connectionId) throw new Error("Conexión no encontrada");
      const supabase = createClient();

      // Verificar usuario (opcional pero consistente con create)
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No hay un usuario autenticado");

      const { error } = await supabase
        .from("connections")
        .update({
          name: values.connectionName,
          db_host: values.host,
          db_name: values.database,
          db_user: values.user,
          db_port: values.port,
          // Nota: la contraseña ahora se almacena en secreto; no se actualiza aquí
        })
        .eq("id", connectionId);

      if (error) throw error;

      toast.success("Conexión actualizada correctamente");
      onOpenChange(false);
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo actualizar la conexión");
      console.error("Update connection failed:", err);
    }
  };

  const handleTest = async (values: FormValues) => {
    try {
      toast.info("Probando conexión...");
      const res = await fetch("/api/test-connection", {
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
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Fallo en la prueba de conexión");
      }
      toast.success("Conexión exitosa");
      return true;
    } catch (err: any) {
      toast.error(err?.message || "No se pudo probar la conexión");
      console.error("Test connection (edit) failed:", err);
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="p-0 border-0 shadow-none bg-transparent sm:max-w-[740px]"
      >
        <DialogTitle className="sr-only">Editar conexión</DialogTitle>
        <ConnectionForm
          defaultValues={initialValues ?? undefined}
          onSubmit={handleSubmit}
          onTestConnection={handleTest}
        />
      </DialogContent>
    </Dialog>
  );
}
