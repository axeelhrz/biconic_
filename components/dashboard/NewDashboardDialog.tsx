"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewDashboardFormData {
  name: string;
}

interface ETL {
  id: string;
  title: string;
  name: string;
}

interface NewDashboardDialogProps {
  children: React.ReactNode;
}

export default function NewDashboardDialog({ children }: NewDashboardDialogProps) {
  const [open, setOpen] = useState(false);
  const [etls, setEtls] = useState<ETL[]>([]);
  const [loading, setLoading] = useState(false);
  const [etlsLoading, setEtlsLoading] = useState(false);
  const [selectedEtlIds, setSelectedEtlIds] = useState<string[]>([]);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewDashboardFormData>({
    defaultValues: {
      name: "",
    },
  });

  const toggleEtl = (etlId: string) => {
    setSelectedEtlIds((prev) =>
      prev.includes(etlId) ? prev.filter((id) => id !== etlId) : [...prev, etlId]
    );
  };

  // Fetch ETLs when dialog opens
  useEffect(() => {
    if (open) {
      fetchEtls();
    }
  }, [open]);

  const fetchEtls = async () => {
    try {
      setEtlsLoading(true);
      const supabase = createClient();
      
      // Get the authenticated user
      const { data: userResp, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      
      const user = userResp.user;
      if (!user) {
        toast.error("No hay un usuario autenticado");
        return;
      }

      // Fetch ETLs for the user
      const { data, error } = await supabase
        .from("etl")
        .select("id, title, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setEtls(data || []);
    } catch (error: any) {
      console.error("Error fetching ETLs:", error);
      toast.error("Error al cargar los ETLs");
    } finally {
      setEtlsLoading(false);
    }
  };

  const onSubmit = async (data: NewDashboardFormData) => {
    try {
      setLoading(true);

      if (selectedEtlIds.length === 0) {
        toast.error("Debes seleccionar al menos un ETL");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          etl_ids: selectedEtlIds,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "No se pudo crear el dashboard");
      }

      toast.success("Dashboard creado exitosamente");
      setOpen(false);
      reset();
      router.push(`/dashboard/${result.id}`);
    } catch (error: any) {
      console.error("Error creating dashboard:", error);
      toast.error(error.message || "Error al crear el dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      reset();
      setSelectedEtlIds([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Dashboard</DialogTitle>
          <DialogDescription>
            Crea un nuevo dashboard y selecciona el ETL al que pertenecerá.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-gray-700">
              Nombre del Dashboard *
            </label>
            <Input
              id="name"
              placeholder="Ingresa el nombre del dashboard"
              {...register("name", {
                required: "El nombre es requerido",
                minLength: {
                  value: 2,
                  message: "El nombre debe tener al menos 2 caracteres",
                },
              })}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              ETLs asociados (métricas y datos) *
            </label>
            {etlsLoading ? (
              <div className="min-h-[120px] w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                <span className="text-sm text-gray-500">Cargando ETLs...</span>
              </div>
            ) : etls.length === 0 ? (
              <div className="min-h-[120px] w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                <span className="text-sm text-gray-500">No hay ETLs disponibles</span>
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {etls.map((etl) => {
                  const selected = selectedEtlIds.includes(etl.id);
                  return (
                    <div
                      key={etl.id}
                      onClick={() => toggleEtl(etl.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                        selected && "bg-emerald-50 font-medium text-emerald-800"
                      )}
                    >
                      <span>{etl.title || etl.name || `ETL ${etl.id}`}</span>
                      {selected && <Check className="h-4 w-4 text-emerald-600" />}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedEtlIds.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedEtlIds.length} fuente(s) seleccionada(s). Métricas y datos se nutrirán de estos ETLs.
              </p>
            )}
            {selectedEtlIds.length === 0 && !etlsLoading && etls.length > 0 && (
              <p className="text-sm text-amber-600">Selecciona al menos un ETL</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || etlsLoading || etls.length === 0 || selectedEtlIds.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {loading ? "Creando..." : "Crear Dashboard"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
