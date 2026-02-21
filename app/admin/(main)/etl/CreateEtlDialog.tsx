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
import { Loader2, Check, FileText, Building2, Search } from "lucide-react";
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
      <DialogContent
        className="sm:max-w-[480px] rounded-2xl border-0 shadow-xl p-0 overflow-hidden"
        style={{
          background: "var(--platform-surface)",
          border: "1px solid var(--platform-border)",
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle
            className="text-xl font-semibold"
            style={{ color: "var(--platform-fg)" }}
          >
            Crear Nuevo ETL
          </DialogTitle>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--platform-fg-muted)" }}
          >
            Asigná un nombre y elegí el cliente al que pertenece.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-6 px-6 py-4">
          <div className="flex flex-col gap-2">
            <Label
              className="text-sm font-medium flex items-center gap-2"
              style={{ color: "var(--platform-fg)" }}
            >
              <FileText className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
              Nombre del ETL
            </Label>
            <Input
              placeholder="Ej: Ventas Mensuales, Reporte Anual"
              value={etlTitle}
              onChange={(e) => setEtlTitle(e.target.value)}
              className="rounded-xl h-11"
              style={{
                background: "var(--platform-bg)",
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              className="text-sm font-medium flex items-center gap-2"
              style={{ color: "var(--platform-fg)" }}
            >
              <Building2 className="h-4 w-4 opacity-70" style={{ color: "var(--platform-fg-muted)" }} />
              Asignar a Cliente
            </Label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                style={{ color: "var(--platform-fg-muted)" }}
              />
              <Input
                placeholder="Buscar cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-xl h-11 pl-10"
                style={{
                  background: "var(--platform-bg)",
                  borderColor: "var(--platform-border)",
                  color: "var(--platform-fg)",
                }}
              />
            </div>
            <div
              className="mt-2 max-h-[220px] overflow-y-auto rounded-xl border p-2"
              style={{
                background: "var(--platform-bg)",
                borderColor: "var(--platform-border)",
              }}
            >
              {loadingClients ? (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: "var(--platform-fg-muted)" }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Buscando clientes...</span>
                </div>
              ) : clients.length === 0 ? (
                <p className="text-center text-sm py-6" style={{ color: "var(--platform-fg-muted)" }}>
                  {query.trim() ? "No se encontraron clientes" : "Escribí para buscar"}
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {clients.map((client) => (
                    <button
                      type="button"
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-colors w-full",
                        selectedClientId === client.id
                          ? "font-medium"
                          : "hover:opacity-90"
                      )}
                      style={{
                        background: selectedClientId === client.id ? "var(--platform-accent)" : "transparent",
                        color: selectedClientId === client.id ? "var(--platform-accent-fg)" : "var(--platform-fg)",
                      }}
                    >
                      <span>{client.name || "Sin nombre"}</span>
                      {selectedClientId === client.id && (
                        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedClientName && (
              <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                Cliente seleccionado: <strong style={{ color: "var(--platform-fg)" }}>{selectedClientName}</strong>
              </p>
            )}
          </div>
        </div>

        <DialogFooter
          className="px-6 py-4 gap-2 border-t"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface-hover)" }}
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
            className="rounded-xl"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedClientId || creating}
            className="rounded-xl font-medium"
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
