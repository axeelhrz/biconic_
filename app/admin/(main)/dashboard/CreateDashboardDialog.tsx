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
import { searchClients, searchEtls, createDashboardAdmin } from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreateDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene desde ETL "Crear dashboard con estos datos", pre-seleccionar este ETL */
  initialEtlId?: string | null;
}

export function CreateDashboardDialog({ open, onOpenChange, initialEtlId }: CreateDashboardDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string | null }[]>(
    []
  );
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [etlQuery, setEtlQuery] = useState("");
  const [etls, setEtls] = useState<{ id: string; title: string }[]>([]);
  const [loadingEtls, setLoadingEtls] = useState(false);
  const [selectedEtlId, setSelectedEtlId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && initialEtlId) setSelectedEtlId(initialEtlId);
  }, [open, initialEtlId]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingEtls(true);
      searchEtls(etlQuery)
        .then((res) => setEtls(res))
        .catch((err) => console.error(err))
        .finally(() => setLoadingEtls(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [etlQuery, open]);

  const handleCreate = async () => {
    if (!selectedClientId) return;
    try {
      setCreating(true);
      const res = await createDashboardAdmin(
        selectedClientId,
        "Nuevo Dashboard",
        selectedEtlId || undefined
      );
      if (!res.ok) {
        toast.error(res.error || "Error al crear Dashboard");
        return;
      }
      toast.success("Dashboard creado correctamente");
      onOpenChange(false);
      router.push(`/admin/dashboard/${res.dashboardId}`);
    } catch (error) {
      toast.error("Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px] border"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--platform-fg)" }}>
            Crear Nuevo Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label style={{ color: "var(--platform-fg-muted)" }}>Asignar a Cliente</Label>
            <Input
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border bg-transparent"
              style={{
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
            <div
              className="mt-2 max-h-[200px] overflow-y-auto rounded-md border p-2"
              style={{
                borderColor: "var(--platform-border)",
                background: "var(--platform-bg-elevated)",
              }}
            >
              {loadingClients ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--platform-fg-muted)" }} />
                </div>
              ) : clients.length === 0 ? (
                <p className="text-center text-sm p-2" style={{ color: "var(--platform-fg-muted)" }}>
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
                        selectedClientId === client.id && "font-medium"
                      )}
                      style={{
                        background: selectedClientId === client.id ? "var(--platform-accent-dim)" : "transparent",
                        color: selectedClientId === client.id ? "var(--platform-accent)" : "var(--platform-fg)",
                      }}
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
          <div className="flex flex-col gap-2">
            <Label style={{ color: "var(--platform-fg-muted)" }}>ETL (origen de datos del dashboard)</Label>
            <Input
              placeholder="Buscar ETL..."
              value={etlQuery}
              onChange={(e) => setEtlQuery(e.target.value)}
              className="border bg-transparent"
              style={{
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
            <div
              className="mt-2 max-h-[200px] overflow-y-auto rounded-md border p-2"
              style={{
                borderColor: "var(--platform-border)",
                background: "var(--platform-bg-elevated)",
              }}
            >
              {loadingEtls ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--platform-fg-muted)" }} />
                </div>
              ) : etls.length === 0 ? (
                <p className="text-center text-sm p-2" style={{ color: "var(--platform-fg-muted)" }}>
                  Buscá un ETL o dejá vacío para asociar después
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div
                    onClick={() => setSelectedEtlId(null)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                      !selectedEtlId && "font-medium"
                    )}
                    style={{
                      background: !selectedEtlId ? "var(--platform-accent-dim)" : "transparent",
                      color: !selectedEtlId ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                    }}
                  >
                    <span>Ninguno (asociar después)</span>
                    {!selectedEtlId && <Check className="h-4 w-4" />}
                  </div>
                  {etls.map((etl) => (
                    <div
                      key={etl.id}
                      onClick={() => setSelectedEtlId(etl.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                        selectedEtlId === etl.id && "font-medium"
                      )}
                      style={{
                        background: selectedEtlId === etl.id ? "var(--platform-accent-dim)" : "transparent",
                        color: selectedEtlId === etl.id ? "var(--platform-accent)" : "var(--platform-fg)",
                      }}
                    >
                      <span>{etl.title || "Sin título"}</span>
                      {selectedEtlId === etl.id && (
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
            className="border hover:opacity-90"
            style={{
              borderColor: "var(--platform-border)",
              color: "var(--platform-fg)",
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedClientId || creating}
            className="text-[#08080b] font-medium hover:opacity-90"
            style={{ background: "var(--platform-accent)" }}
          >
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear y Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
