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
import { searchClients, createEtlAdmin } from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreateEtlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEtlDialog({ open, onOpenChange }: CreateEtlDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<"select-client" | "create">("select-client");
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string | null }[]>(
    []
  );
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [etlTitle, setEtlTitle] = useState("Nuevo ETL");
  const [creating, setCreating] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingClients(true);
      searchClients(query)
        .then((res) => setClients(res))
        .catch((err) => console.error(err))
        .finally(() => setLoadingClients(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleCreate = async () => {
    if (!selectedClientId) return;
    try {
      setCreating(true);
      const title = etlTitle.trim() || "Nuevo ETL";
      const res = await createEtlAdmin(selectedClientId, title);
      if (!res.ok) {
        toast.error(res.error || "Error al crear ETL");
        return;
      }
      toast.success("ETL creado correctamente");
      onOpenChange(false);
      router.push(`/admin/etl/${res.etlId}`);
    } catch (error) {
      toast.error("Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  const selectedClientName = clients.find((c) => c.id === selectedClientId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo ETL</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Nombre del ETL</Label>
            <Input
              placeholder="Ej: Ventas Mensuales"
              value={etlTitle}
              onChange={(e) => setEtlTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Asignar a Cliente</Label>
            <Input
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            
            <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border border-gray-100 bg-slate-50 p-2">
              {loadingClients ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : clients.length === 0 ? (
                <p className="text-center text-sm text-gray-400 p-2">
                  No se encontraron clientes
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                        selectedClientId === client.id
                          ? "bg-emerald-50 text-emerald-700 font-medium"
                          : "hover:bg-gray-100 text-gray-700"
                      )}
                    >
                      <span>{client.name || "Sin nombre"}</span>
                      {selectedClientId === client.id && (
                        <Check className="h-4 w-4" />
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
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedClientId || creating}
            className="hover:opacity-90"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear y Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
