"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { updateDashboardTitle, updateDashboardEtl, searchEtls } from "@/app/admin/(main)/dashboard/actions";
import { toast } from "sonner";
import { Check, Loader2, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardHeaderDetailsProps {
  dashboardId: string;
  etlId?: string | null;
  etlName?: string | null;
  title?: string;
  onEtlChange?: () => void;
}

export function DashboardHeaderDetails({
  dashboardId,
  etlId,
  etlName,
  title: initialTitle,
  onEtlChange,
}: DashboardHeaderDetailsProps) {
  const [title, setTitle] = useState(initialTitle || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [etlOpen, setEtlOpen] = useState(false);
  const [etlQuery, setEtlQuery] = useState("");
  const [etls, setEtls] = useState<{ id: string; title: string }[]>([]);
  const [loadingEtls, setLoadingEtls] = useState(false);
  const [savingEtl, setSavingEtl] = useState(false);

  useEffect(() => {
    setTitle(initialTitle || "");
  }, [initialTitle]);

  useEffect(() => {
    if (!etlOpen) return;
    const timer = setTimeout(() => {
      setLoadingEtls(true);
      searchEtls(etlQuery)
        .then(setEtls)
        .catch(() => setEtls([]))
        .finally(() => setLoadingEtls(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [etlOpen, etlQuery]);

  const handleSaveTitle = async () => {
    if (!title.trim() || title === initialTitle) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await updateDashboardTitle(dashboardId, title);
      if (!res.ok) {
        toast.error(res.error || "Error al actualizar el título");
        setTitle(initialTitle || "");
      } else {
        toast.success("Título actualizado");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error inesperado");
    } finally {
      setIsLoading(false);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveTitle();
    } else if (e.key === "Escape") {
      setTitle(initialTitle || "");
      setIsEditing(false);
    }
  };

  const handleSelectEtl = async (newEtlId: string | null) => {
    setSavingEtl(true);
    try {
      const res = await updateDashboardEtl(dashboardId, newEtlId);
      if (!res.ok) {
        toast.error(res.error || "Error al actualizar el ETL");
        return;
      }
      toast.success(newEtlId ? "ETL asociado" : "ETL desasociado");
      setEtlOpen(false);
      onEtlChange?.();
    } catch (e) {
      toast.error("Error inesperado");
    } finally {
      setSavingEtl(false);
    }
  };

  return (
    <>
      <span className="font-medium text-gray-900 mx-1">
        {isEditing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isLoading}
            className="h-6 w-48 inline-block text-sm"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-gray-100 px-1 rounded transition-colors border border-transparent hover:border-gray-200"
            title="Clic para editar"
          >
            {title || "Sin título"}
          </span>
        )}
      </span>
      {onEtlChange && (
        <Popover open={etlOpen} onOpenChange={setEtlOpen}>
          <PopoverTrigger asChild>
            <span className="inline-flex items-center gap-1 mx-1 cursor-pointer hover:bg-gray-100 px-1.5 py-0.5 rounded text-sm border border-transparent hover:border-gray-200">
              <Database className="h-3.5 w-3.5 text-purple-500" />
              {etlName ? (
                <span className="font-medium text-purple-600">{etlName}</span>
              ) : (
                <span className="text-gray-500">Asociar ETL</span>
              )}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Buscar ETL..."
                value={etlQuery}
                onChange={(e) => setEtlQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {loadingEtls ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  <div
                    onClick={() => !savingEtl && handleSelectEtl(null)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                      !etlId
                        ? "bg-purple-50 text-purple-700 font-medium"
                        : "hover:bg-gray-100 text-gray-700"
                    )}
                  >
                    <span className="text-gray-500">Ninguno (quitar ETL)</span>
                    {!etlId && <Check className="h-4 w-4" />}
                  </div>
                  {etls.map((etl) => (
                    <div
                      key={etl.id}
                      onClick={() => !savingEtl && handleSelectEtl(etl.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                        etlId === etl.id
                          ? "bg-purple-50 text-purple-700 font-medium"
                          : "hover:bg-gray-100 text-gray-700"
                      )}
                    >
                      <span>{etl.title || "Sin título"}</span>
                      {etlId === etl.id && <Check className="h-4 w-4" />}
                    </div>
                  ))}
                </>
              )}
            </div>
            {savingEtl && (
              <div className="flex items-center gap-2 p-2 border-t text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
      {!onEtlChange && etlName && (
        <>
          {" "}
          / ETL:{" "}
          <span className="font-medium text-purple-600">{etlName}</span>
        </>
      )}
    </>
  );
}
