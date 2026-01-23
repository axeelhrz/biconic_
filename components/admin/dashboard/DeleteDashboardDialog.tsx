"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteDashboard } from "@/app/admin/(main)/dashboard/actions";

interface DeleteDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string | null;
  dashboardTitle: string | null;
  onSuccess?: () => void;
}

export function DeleteDashboardDialog({
  open,
  onOpenChange,
  dashboardId,
  dashboardTitle,
  onSuccess,
}: DeleteDashboardDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!dashboardId) return;

    try {
      setIsDeleting(true);
      const res = await deleteDashboard(dashboardId);

      if (!res.ok) {
        toast.error(res.error || "Error al eliminar el dashboard");
        return;
      }

      toast.success("Dashboard eliminado correctamente");
      onOpenChange(false);
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error("Error desconocido al eliminar");
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Estás seguro?</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Esto eliminará permanentemente el dashboard{" "}
            <span className="font-semibold text-black">
              {dashboardTitle || "seleccionado"}
            </span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
