"use client";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

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
      // Primero eliminar metadatos asociados, luego la conexión
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogTitle>Eliminar conexión</DialogTitle>
        <p className="text-sm text-[#555]">
          ¿Está seguro que desea eliminar la conexión
          {connectionTitle ? ` "${connectionTitle}"` : ""}? Esta acción no se
          puede deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            className="h-9 rounded-full border border-[#00030A] px-4 text-sm font-medium text-[#00030A]"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-9 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
            onClick={handleConfirm}
          >
            Eliminar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
