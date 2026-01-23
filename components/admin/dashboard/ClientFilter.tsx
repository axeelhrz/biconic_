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
        className="flex h-[42px] items-center justify-between gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 focus:border-blue-500 focus:outline-none w-[200px]"
      >
        <span className="truncate">
          {selectedClient ? selectedClient.name : "Filtrar por Cliente"}
        </span>
        <div className="flex items-center gap-1">
          {selectedClient && (
            <div
              role="button"
              onClick={handleClear}
              className="rounded-full p-0.5 hover:bg-gray-200"
            >
              <X className="h-3 w-3" />
            </div>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-500"
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[200px] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : clients.length === 0 ? (
              <div className="p-2 text-center text-xs text-gray-400">
                No se encontraron resultados
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => handleSelect(client)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-gray-100",
                      selectedClient?.id === client.id && "bg-blue-50 text-blue-600"
                    )}
                  >
                    <span className="truncate">{client.name}</span>
                    {selectedClient?.id === client.id && (
                      <Check className="h-3 w-3" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
