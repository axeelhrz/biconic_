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
import { Loader2, Check, Building2, Layers, ChevronRight } from "lucide-react";
import {
  searchClients,
  searchDatasetsForClient,
  createDashboardAdmin,
  getCreateDashboardSeedFromEtl,
  type DatasetSearchResult,
} from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreateDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene desde ETL "Crear dashboard con estos datos", pre-seleccionar datasets de ese ETL */
  initialEtlId?: string | null;
}

export function CreateDashboardDialog({ open, onOpenChange, initialEtlId }: CreateDashboardDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string | null }[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [datasetQuery, setDatasetQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetSearchResult[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [seedAppliedForEtl, setSeedAppliedForEtl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedClientId(null);
      setSelectedClientName(null);
      setDatasetQuery("");
      setDatasets([]);
      setSelectedDatasetIds([]);
      setSeedAppliedForEtl(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialEtlId || seedAppliedForEtl === initialEtlId) return;
    let cancelled = false;
    (async () => {
      const seed = await getCreateDashboardSeedFromEtl(initialEtlId);
      if (cancelled || !seed?.clientId) return;
      setSelectedClientId(seed.clientId);
      setSelectedClientName(seed.clientName);
      setClients((prev) => {
        if (prev.some((c) => c.id === seed.clientId)) return prev;
        return [{ id: seed.clientId!, name: seed.clientName }, ...prev];
      });
      setDatasets(seed.datasets);
      setSelectedDatasetIds(seed.datasets.map((d) => d.id));
      setSeedAppliedForEtl(initialEtlId);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialEtlId, seedAppliedForEtl]);

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
    if (!selectedClientId) {
      setDatasets([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoadingDatasets(true);
      searchDatasetsForClient(selectedClientId, datasetQuery)
        .then((res) => setDatasets(res))
        .catch((err) => console.error(err))
        .finally(() => setLoadingDatasets(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedClientId, datasetQuery]);

  const selectClient = (clientId: string, clientName: string | null) => {
    setSelectedClientId(clientId);
    setSelectedClientName(clientName);
    setSelectedDatasetIds([]);
    setDatasetQuery("");
  };

  const toggleDataset = (datasetId: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(datasetId) ? prev.filter((id) => id !== datasetId) : [...prev, datasetId]
    );
  };

  const handleCreate = async () => {
    if (!selectedClientId || selectedDatasetIds.length === 0) return;
    try {
      setCreating(true);
      const res = await createDashboardAdmin(
        selectedClientId,
        "Nuevo Dashboard",
        selectedDatasetIds
      );
      if (!res.ok) {
        toast.error(res.error || "Error al crear Dashboard");
        return;
      }
      toast.success("Dashboard creado correctamente");
      onOpenChange(false);
      router.push(`/admin/dashboard/${res.dashboardId}`);
    } catch {
      toast.error("Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  const selectedClient =
    clients.find((c) => c.id === selectedClientId) ??
    (selectedClientId
      ? { id: selectedClientId, name: selectedClientName }
      : null);

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
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
            >
              <Layers className="h-5 w-5" />
            </span>
            Crear nuevo dashboard
          </DialogTitle>
          <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
            Asigná un cliente y elegí el dataset sobre el que vas a trabajar. Solo se listan datasets de ese cliente.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-6 px-6 py-5 overflow-y-auto max-h-[60vh]">
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
                          onClick={() => selectClient(client.id, client.name)}
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
                Cliente seleccionado:{" "}
                <strong style={{ color: "var(--platform-fg)" }}>{selectedClient.name}</strong>
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
              <Layers className="h-4 w-4" style={{ color: "var(--platform-accent)" }} />
              Dataset
            </Label>
            <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
              Obligatorio: elegí al menos un dataset del cliente. El dashboard trabajará sobre esos datos semánticos.
            </p>
            {!selectedClientId ? (
              <div
                className="rounded-xl border px-4 py-8 text-center text-sm"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg-muted)" }}
              >
                Primero seleccioná un cliente para ver sus datasets.
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar dataset..."
                  value={datasetQuery}
                  onChange={(e) => setDatasetQuery(e.target.value)}
                  className="h-11 rounded-xl border-0 bg-[var(--platform-bg)] pl-4 text-sm placeholder:opacity-70"
                  style={{ color: "var(--platform-fg)" }}
                />
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                >
                  <div className="max-h-[180px] overflow-y-auto p-1">
                    {loadingDatasets ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--platform-accent)" }} />
                      </div>
                    ) : datasets.length === 0 ? (
                      <p className="text-center text-sm py-6" style={{ color: "var(--platform-fg-muted)" }}>
                        {datasetQuery
                          ? "No se encontraron datasets"
                          : "Este cliente no tiene datasets disponibles"}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {datasets.map((ds) => {
                          const selected = selectedDatasetIds.includes(ds.id);
                          return (
                            <button
                              key={ds.id}
                              type="button"
                              onClick={() => toggleDataset(ds.id)}
                              className={cn(
                                "w-full flex items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition-all",
                                selected && "ring-2 ring-[var(--platform-accent)]"
                              )}
                              style={{
                                background: selected ? "var(--platform-accent-dim)" : "transparent",
                                color: selected ? "var(--platform-accent)" : "var(--platform-fg)",
                              }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{ds.name}</span>
                                <span
                                  className="block truncate text-[11px] font-normal opacity-80"
                                  style={{ color: selected ? "inherit" : "var(--platform-fg-muted)" }}
                                >
                                  ETL: {ds.etlTitle}
                                </span>
                              </span>
                              {selected ? (
                                <Check className="h-5 w-5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {selectedDatasetIds.length > 0 && (
              <p className="text-xs flex items-center gap-1" style={{ color: "var(--platform-fg-muted)" }}>
                <Check className="h-3.5 w-3.5 text-green-500" />
                {selectedDatasetIds.length} dataset{selectedDatasetIds.length !== 1 ? "s" : ""} seleccionado
                {selectedDatasetIds.length !== 1 ? "s" : ""}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter
          className="px-6 py-4 border-t gap-3 flex-row justify-end"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
        >
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
            disabled={!selectedClientId || selectedDatasetIds.length === 0 || creating}
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
