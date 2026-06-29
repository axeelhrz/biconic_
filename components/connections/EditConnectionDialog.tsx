"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import ConnectionForm from "./ConnectionForm";
import { createClient } from "@/lib/supabase/client";
import { safeJsonResponse } from "@/lib/safe-json-response";
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

      const res = await fetch("/api/connection/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          connectionName: values.connectionName,
          host: values.host,
          database: values.database,
          user: values.user,
          port: values.port,
        }),
      });
      const data = await safeJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo actualizar la conexión");
      }

      toast.success("Conexión actualizada correctamente");
      onOpenChange(false);
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo actualizar la conexión"
      );
      console.error("Update connection failed:", err);
    }
  };

  const handleTest = async (values: FormValues) => {
    try {
      toast.info("Probando conexión...");
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
