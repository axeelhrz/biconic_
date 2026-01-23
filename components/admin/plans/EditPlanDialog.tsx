"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Database } from "@/lib/supabase/database.types";
import { toast } from "sonner";
import { upsertPlan } from "@/actions/plans";

type Plan = Database["public"]["Tables"]["plans"]["Row"];

interface EditPlanDialogProps {
  plan: Plan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function EditPlanDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: EditPlanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Plan>>({});

  useEffect(() => {
    if (plan) {
      setFormData(plan);
    } else {
      setFormData({
        name: "",
        description: "",
        price_monthly: 0,
        price_yearly: 0,
        currency: "USD",
        trial_days: 0,
        is_active: true,
      });
    }
  }, [plan, open]);

  const handleChange = (field: keyof Plan, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await upsertPlan(formData as any);
      toast.success(plan ? "Plan actualizado correctamente" : "Plan creado correctamente");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Error al guardar el plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar Plan" : "Nuevo Plan"}</DialogTitle>
          <DialogDescription>
            {plan
              ? "Modifica los detalles del plan aquí."
              : "Ingresa los detalles para el nuevo plan."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nombre
            </Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Descripción
            </Label>
            <Input
              id="description"
              value={formData.description || ""}
              onChange={(e) => handleChange("description", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price_monthly" className="text-right">
              Precio Mensual
            </Label>
            <Input
              id="price_monthly"
              type="number"
              value={formData.price_monthly || 0}
              onChange={(e) =>
                handleChange("price_monthly", parseFloat(e.target.value))
              }
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price_yearly" className="text-right">
              Precio Anual
            </Label>
            <Input
              id="price_yearly"
              type="number"
              value={formData.price_yearly || 0}
              onChange={(e) =>
                handleChange("price_yearly", parseFloat(e.target.value))
              }
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="currency" className="text-right">
              Moneda
            </Label>
            <Input
              id="currency"
              value={formData.currency || "USD"}
              onChange={(e) => handleChange("currency", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="trial_days" className="text-right">
              Días de Prueba
            </Label>
            <Input
              id="trial_days"
              type="number"
              value={formData.trial_days || 0}
              onChange={(e) =>
                handleChange("trial_days", parseInt(e.target.value))
              }
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="is_active" className="text-right">
              Activo
            </Label>
            <Checkbox
              id="is_active"
              checked={formData.is_active || false}
              onCheckedChange={(checked) => handleChange("is_active", checked)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave} disabled={loading}>
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
