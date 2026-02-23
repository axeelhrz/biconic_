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
import { Loader2, Check, Building2, Database, ChevronRight } from "lucide-react";
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
  const [clients, setClients] = useState<{ id: string; name: string | null }[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [etlQuery, setEtlQuery] = useState("");
  const [etls, setEtls] = useState<{ id: string; title: string }[]>([]);
  const [loadingEtls, setLoadingEtls] = useState(false);
  const [selectedEtlIds, setSelectedEtlIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && initialEtlId) setSelectedEtlIds((prev) => (prev.includes(initialEtlId) ? prev : [...prev, initialEtlId]));
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

  const toggleEtl = (etlId: string) => {
    setSelectedEtlIds((prev) =>
      prev.includes(etlId) ? prev.filter((id) => id !== etlId) : [...prev, etlId]
    );
  };

  const handleCreate = async () => {
    if (!selectedClientId) return;
    try {
      setCreating(true);
      const res = await createDashboardAdmin(
        selectedClientId,
        "Nuevo Dashboard",
        selectedEtlIds.length > 0 ? selectedEtlIds : undefined
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

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] p-0 gap-0 border overflow-hidden"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--platform-border)" }}>
          <DialogTitle className="text-xl font-bold flex items-center gap-3" style={{ color: "var(--platform-fg)" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}>
              <Database className="h-5 w-5" />
            </span>
            Crear nuevo dashboard
          </DialogTitle>
          <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
            Asigná un cliente y elegí las fuentes de datos. Podés agregar más ETLs después en el editor.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-6 px-6 py-5 overflow-y-auto max-h-[60vh]">
          {/* Cliente */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
              <Building2 className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
              Asignar a cliente
            </Label>
            <Input
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-xl border-0 bg-[var(--platform-bg)] pl-4 text-sm placeholder:opacity-70"
              style={{ color: "var(--platform-fg)" }}
            />
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
            >
              <div className="max-h-[180px] overflow-y-auto p-1">
                {loadingClients ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--platform-accent)" }} />
                  </div>
                ) : clients.length === 0 ? (
                  <p className="text-center text-sm py-6" style={{ color: "var(--platform-fg-muted)" }}>
                    {query ? "No se encontraron clientes" : "Escribí para buscar"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {clients.map((client) => {
                      const selected = selectedClientId === client.id;
                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => setSelectedClientId(client.id)}
                          className={cn(
                            "w-full flex items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition-all",
                            selected && "ring-2 ring-[var(--platform-accent)]"
                          )}
                          style={{
                            background: selected ? "var(--platform-accent-dim)" : "transparent",
                            color: selected ? "var(--platform-accent)" : "var(--platform-fg)",
                          }}
                        >
                          <span>{client.name || "Sin nombre"}</span>
                          {selected && <Check className="h-5 w-5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {selectedClient && (
              <p className="text-xs flex items-center gap-1" style={{ color: "var(--platform-fg-muted)" }}>
                <Check className="h-3.5 w-3.5 text-green-500" />
                Cliente seleccionado: <strong style={{ color: "var(--platform-fg)" }}>{selectedClient.name}</strong>
              </p>
            )}
          </div>

          {/* Fuentes de datos (ETLs) */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
              <Database className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
              Fuentes de datos (ETLs)
            </Label>
            <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
              Ventas, clientes, productos, etc. Podés elegir varias; en el editor asignás qué fuente usa cada gráfico.
            </p>
            <Input
              placeholder="Buscar ETL..."
              value={etlQuery}
              onChange={(e) => setEtlQuery(e.target.value)}
              className="h-11 rounded-xl border-0 bg-[var(--platform-bg)] pl-4 text-sm placeholder:opacity-70"
              style={{ color: "var(--platform-fg)" }}
            />
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
            >
              <div className="max-h-[180px] overflow-y-auto p-1">
                {loadingEtls ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--platform-accent)" }} />
                  </div>
                ) : etls.length === 0 ? (
                  <p className="text-center text-sm py-6" style={{ color: "var(--platform-fg-muted)" }}>
                    {etlQuery ? "No se encontraron ETLs" : "Buscá ETLs o dejá vacío para asociar después"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {etls.map((etl) => {
                      const selected = selectedEtlIds.includes(etl.id);
                      return (
                        <button
                          key={etl.id}
                          type="button"
                          onClick={() => toggleEtl(etl.id)}
                          className={cn(
                            "w-full flex items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition-all",
                            selected && "ring-2 ring-[var(--platform-accent)]"
                          )}
                          style={{
                            background: selected ? "var(--platform-accent-dim)" : "transparent",
                            color: selected ? "var(--platform-accent)" : "var(--platform-fg)",
                          }}
                        >
                          <span>{etl.title || "Sin título"}</span>
                          {selected ? <Check className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {selectedEtlIds.length > 0 && (
              <p className="text-xs flex items-center gap-1" style={{ color: "var(--platform-fg-muted)" }}>
                <Check className="h-3.5 w-3.5 text-green-500" />
                {selectedEtlIds.length} fuente{selectedEtlIds.length !== 1 ? "s" : ""} seleccionada{selectedEtlIds.length !== 1 ? "s" : ""}. En el editor elegís qué fuente usa cada widget.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-3 flex-row justify-end" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
            className="rounded-xl h-11 px-5 font-medium"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedClientId || creating}
            className="rounded-xl h-11 px-6 font-semibold gap-2"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear y abrir editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
