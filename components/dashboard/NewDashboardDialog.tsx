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
import { Select, SelectOption } from "@/components/ui/Select";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";

interface NewDashboardFormData {
  name: string;
  etl_id: string;
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
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<NewDashboardFormData>({
    defaultValues: {
      name: "",
      etl_id: "",
    },
  });

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
      
      // Validate that we have an ETL selected
      if (!data.etl_id || data.etl_id.trim() === "") {
        toast.error("Debes seleccionar un ETL");
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
          etl_id: data.etl_id,
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
    }
  };

  // Convert ETLs to select options
  const etlOptions: SelectOption[] = etls.map((etl) => ({
    value: etl.id,
    label: etl.title || etl.name || `ETL ${etl.id}`,
  }));

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
            <label htmlFor="etl_id" className="text-sm font-medium text-gray-700">
              ETL Asociado *
            </label>
            {etlsLoading ? (
              <div className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                <span className="text-sm text-gray-500">Cargando ETLs...</span>
              </div>
            ) : etlOptions.length === 0 ? (
              <div className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                <span className="text-sm text-gray-500">No hay ETLs disponibles</span>
              </div>
            ) : (
              <Controller
                name="etl_id"
                control={control}
                rules={{ 
                  required: "Debes seleccionar un ETL",
                  validate: (value) => {
                    if (!value || value.trim() === "") {
                      return "Debes seleccionar un ETL";
                    }
                    return true;
                  }
                }}
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onChange={(value: string) => {
                      field.onChange(value);
                    }}
                    options={etlOptions}
                    placeholder="Selecciona un ETL"
                    className={errors.etl_id ? "border-red-500" : ""}
                    name={field.name}
                  />
                )}
              />
            )}
            {errors.etl_id && (
              <p className="text-sm text-red-500">{errors.etl_id.message}</p>
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
              disabled={loading || etlsLoading || etlOptions.length === 0}
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
