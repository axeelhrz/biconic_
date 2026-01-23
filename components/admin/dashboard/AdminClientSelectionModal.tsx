"use client";

import { useEffect, useState, useMemo } from "react";
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
        .select("id, company_name")
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Asignar Cliente</DialogTitle>
          <DialogDescription>
            Este dashboard no tiene un cliente asignado. Por favor selecciona uno para continuar guardando.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="text-sm text-gray-500 text-center py-8">
              Cargando clientes...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => setSelectedId(client.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === client.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50 bg-white"
                  }`}
                >
                  <div className="h-10 w-10 relative flex-shrink-0 bg-gray-100 rounded-full overflow-hidden flex items-center justify-center">
                    {client.logo_url ? (
                      <Image
                        src={client.logo_url}
                        alt={client.company_name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-gray-400 font-bold text-xs">
                        {client.company_name.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${selectedId === client.id ? 'text-blue-700' : 'text-gray-700'}`}>
                        {client.company_name}
                    </p>
                  </div>
                  {selectedId === client.id && (
                    <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {clients.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                      No se encontraron clientes.
                  </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId || saving}>
            {saving ? "Guardando..." : "Asignar y Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
