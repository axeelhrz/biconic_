"use client";

import { useEffect, useState, useRef } from "react";
import { Search, X, ChevronDown, Check, Loader2 } from "lucide-react";
import { searchClients } from "@/app/admin/(main)/dashboard/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Client {
  id: string;
  name: string;
}

interface ClientFilterProps {
  onSelect: (clientId: string | null) => void;
}

export function ClientFilter({ onSelect }: ClientFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search effect
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      setLoading(true);
      searchClients(query)
        .then((res) => {
             // Map the result if needed, but searchClients returns {id, name} already?
             // Let's verify actions.ts. Yes, returns {id, name}.
             setClients(res as unknown as Client[]); 
        })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const handleSelect = (client: Client) => {
    setSelectedClient(client);
    onSelect(client.id);
    setIsOpen(false);
    setQuery(""); // Reset query? Or keep it? keeping it empty for next search is better.
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClient(null);
    onSelect(null);
    setQuery("");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-11 items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)] w-[200px]"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
          color: "var(--platform-fg-muted)",
        }}
      >
        <span className="truncate">
          {selectedClient ? selectedClient.name : "Filtrar por Cliente"}
        </span>
        <div className="flex items-center gap-1">
          {selectedClient && (
            <div
              role="button"
              onClick={handleClear}
              className="rounded-full p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </div>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[300px] rounded-2xl border p-3 shadow-lg"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--platform-fg-muted)" }}>
            Clientes
          </p>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              autoFocus
              className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--platform-accent)]"
              style={{
                borderColor: "var(--platform-border)",
                background: "var(--platform-bg)",
                color: "var(--platform-fg)",
              }}
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[220px] overflow-y-auto rounded-xl -mx-1 px-1" style={{ background: "var(--platform-bg)" }}>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--platform-accent)" }} />
              </div>
            ) : clients.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                No se encontraron resultados
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {clients.map((client) => {
                  const selected = selectedClient?.id === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleSelect(client)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-all",
                        selected && "ring-2 ring-[var(--platform-accent)]"
                      )}
                      style={{
                        background: selected ? "var(--platform-accent-dim)" : "transparent",
                        color: selected ? "var(--platform-accent)" : "var(--platform-fg)",
                      }}
                    >
                      <span className="truncate">{client.name}</span>
                      {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
