"use client";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle } from "lucide-react";

type DeleteConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  connectionTitle?: string | null;
  onDeleted?: () => void;
};

export default function DeleteConnectionDialog({
  open,
  onOpenChange,
  connectionId,
  connectionTitle,
  onDeleted,
}: DeleteConnectionDialogProps) {
  const handleConfirm = async () => {
    try {
      if (!connectionId) return;
      const supabase = createClient();
      await supabase
        .from("data_tables")
        .delete()
        .eq("connection_id", connectionId);
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);
      if (error) throw error;
      toast.success("Conexión eliminada correctamente");
      onOpenChange(false);
      onDeleted?.();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo eliminar la conexión");
      console.error("Delete connection failed:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border rounded-2xl"
        showCloseButton
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
        }}
      >
        <div className="p-6">
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: "rgba(248, 113, 113, 0.15)", color: "var(--platform-danger)" }}
          >
            <AlertTriangle className="h-6 w-6" strokeWidth={2} />
          </div>
          <DialogTitle className="text-lg font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
            Eliminar conexión
          </DialogTitle>
          <p className="text-sm leading-relaxed" style={{ color: "var(--platform-fg-muted)" }}>
            ¿Estás seguro de que querés eliminar la conexión
            {connectionTitle ? (
              <span className="font-medium" style={{ color: "var(--platform-fg)" }}> "{connectionTitle}"</span>
            ) : (
              ""
            )}
            ? Esta acción no se puede deshacer y se eliminarán los datos asociados.
          </p>
          <div className="mt-6 flex flex-row justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                color: "var(--platform-fg)",
                border: "1px solid var(--platform-border)",
                background: "var(--platform-bg)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-10 px-4 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--platform-danger)" }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
