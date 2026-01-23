"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { searchEtls, updateDashboardEtl } from "@/app/admin/(main)/dashboard/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChangeDashboardEtlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  currentEtlId?: string;
  onSuccess?: () => void;
}

export function ChangeDashboardEtlDialog({ 
  open, 
  onOpenChange, 
  dashboardId,
  currentEtlId,
  onSuccess
}: ChangeDashboardEtlDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [etls, setEtls] = useState<{ id: string; title: string }[]>([]);
  const [loadingEtls, setLoadingEtls] = useState(false);
  const [selectedEtlId, setSelectedEtlId] = useState<string | null>(currentEtlId || null);
  const [saving, setSaving] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingEtls(true);
      searchEtls(query)
        .then((res) => setEtls(res))
        .catch((err) => console.error(err))
        .finally(() => setLoadingEtls(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset selected ETL when dialog opens or currentEtlId changes
  useEffect(() => {
      if (open) {
          setSelectedEtlId(currentEtlId || null);
      }
  }, [open, currentEtlId]);

  const handleSave = async () => {
    if (!selectedEtlId) return;
    try {
      console.log("[ChangeDashboardEtlDialog] handleSave saving...", { dashboardId, selectedEtlId });
      setSaving(true);
      const res = await updateDashboardEtl(dashboardId, selectedEtlId);
      console.log("[ChangeDashboardEtlDialog] handleSave response", res);
      if (!res.ok) {
        toast.error(res.error || "Error al actualizar ETL");
        return;
      }
      toast.success("ETL actualizado correctamente");
      onOpenChange(false);
      router.refresh(); // Refresh to show new ETL name
      onSuccess?.();
    } catch (error) {
      toast.error("Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cambiar ETL asociado</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Seleccionar ETL</Label>
            <Input
              placeholder="Buscar ETL..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            
            <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border border-gray-100 bg-slate-50 p-2">
              {loadingEtls ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : etls.length === 0 ? (
                <p className="text-center text-sm text-gray-400 p-2">
                  No se encontraron ETLs
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {etls.map((etl) => (
                    <div
                      key={etl.id}
                      onClick={() => setSelectedEtlId(etl.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                        selectedEtlId === etl.id
                          ? "bg-emerald-50 text-emerald-700 font-medium"
                          : "hover:bg-gray-100 text-gray-700"
                      )}
                    >
                      <span className="truncate">{etl.title}</span>
                      {selectedEtlId === etl.id && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedEtlId || saving}
            className="bg-[#0F5F4C] hover:bg-[#0b4638]"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
