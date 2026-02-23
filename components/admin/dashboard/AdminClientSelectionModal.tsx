"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { Building2, Check, Loader2 } from "lucide-react";

type ClientOption = {
  id: string;
  company_name: string;
  logo_url?: string | null;
};

interface AdminClientSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (clientId: string) => Promise<void>;
}

export default function AdminClientSelectionModal({
  open,
  onOpenChange,
  onSelect,
}: AdminClientSelectionModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchClients = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("id, company_name, logo_url")
        .order("company_name", { ascending: true });

      if (!error && data) {
        setClients(data as unknown as ClientOption[]);
      }
      setLoading(false);
    };
    fetchClients();
  }, [open]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await onSelect(selectedId);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] p-0 gap-0 overflow-hidden rounded-2xl border"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--platform-border)" }}>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}>
              <Building2 className="h-5 w-5" />
            </span>
            Asignar cliente
          </DialogTitle>
          <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
            Este dashboard no tiene un cliente asignado. Seleccioná uno para poder guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: "var(--platform-fg-muted)" }}>
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
              <span className="text-sm">Cargando clientes...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-1">
              {clients.map((client) => {
                const selected = selectedId === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedId(client.id)}
                    className="flex items-center gap-3 w-full rounded-xl border p-3 text-left transition-all"
                    style={{
                      borderColor: selected ? "var(--platform-accent)" : "var(--platform-border)",
                      background: selected ? "var(--platform-accent-dim)" : "var(--platform-bg)",
                    }}
                  >
                    <div
                      className="h-10 w-10 relative flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                      style={{ background: "var(--platform-surface-hover)" }}
                    >
                      {client.logo_url ? (
                        <Image
                          src={client.logo_url}
                          alt={client.company_name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-sm font-semibold" style={{ color: "var(--platform-fg-muted)" }}>
                          {client.company_name.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: selected ? "var(--platform-accent)" : "var(--platform-fg)" }}
                      >
                        {client.company_name}
                      </p>
                    </div>
                    {selected && (
                      <div
                        className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </div>
                    )}
                  </button>
                );
              })}

              {clients.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                  No se encontraron clientes.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter
          className="px-6 py-4 gap-3 border-t"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
        >
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl h-11 px-5 font-medium"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="rounded-xl h-11 px-6 font-semibold gap-2"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Guardando…" : "Asignar y guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
