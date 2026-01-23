"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renameEtlAction } from "@/app/(main)/etl/actions";
import { toast } from "sonner";

interface RenameEtlModalProps {
  etlId: string;
  currentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: (newTitle: string) => void;
}

export function RenameEtlModal({
  etlId,
  currentTitle,
  open,
  onOpenChange,
  onRenamed,
}: RenameEtlModalProps) {
  const [title, setTitle] = useState(currentTitle);
  const [isLoading, setIsLoading] = useState(false);

  // Reset title when modal opens or currentTitle changes
  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
    }
  }, [open, currentTitle]);

  const handleConfirm = async () => {
    const trimmedTitle = title.trim();
    
    if (!trimmedTitle) {
      toast.error("El título no puede estar vacío");
      return;
    }

    if (trimmedTitle === currentTitle) {
      // No changes, just close
      onOpenChange(false);
      return;
    }

    setIsLoading(true);

    try {
      const { ok, data, error } = await renameEtlAction(etlId, trimmedTitle);

      if (!ok) {
        toast.error(error || "Error al renombrar el ETL");
        return;
      }

      toast.success("ETL renombrado exitosamente");
      onRenamed?.(data || trimmedTitle);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Error al renombrar el ETL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renombrar ETL</DialogTitle>
          <DialogDescription>
            Ingresa el nuevo nombre para este ETL.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nombre del ETL"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
            disabled={isLoading}
          />
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !title.trim()}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {isLoading ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RenameEtlModal;
