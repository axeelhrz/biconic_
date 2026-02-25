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

  const inputStyle = {
    borderColor: "var(--platform-border)",
    background: "var(--platform-surface)",
    color: "var(--platform-fg)",
  };
  const labelClass = "text-right text-sm font-semibold";
  const labelStyle = { color: "var(--platform-fg)" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px] rounded-2xl border"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--platform-fg)" }}>
            {plan ? "Editar Plan" : "Nuevo Plan"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
            {plan
              ? "Modifica los detalles del plan aquí."
              : "Ingresa los detalles para el nuevo plan."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className={labelClass} style={labelStyle}>
              Nombre
            </Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className={labelClass} style={labelStyle}>
              Descripción
            </Label>
            <Input
              id="description"
              value={formData.description || ""}
              onChange={(e) => handleChange("description", e.target.value)}
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price_monthly" className={labelClass} style={labelStyle}>
              Precio Mensual
            </Label>
            <Input
              id="price_monthly"
              type="number"
              value={formData.price_monthly ?? 0}
              onChange={(e) =>
                handleChange("price_monthly", parseFloat(e.target.value) || 0)
              }
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price_yearly" className={labelClass} style={labelStyle}>
              Precio Anual
            </Label>
            <Input
              id="price_yearly"
              type="number"
              value={formData.price_yearly ?? 0}
              onChange={(e) =>
                handleChange("price_yearly", parseFloat(e.target.value) || 0)
              }
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="currency" className={labelClass} style={labelStyle}>
              Moneda
            </Label>
            <Input
              id="currency"
              value={formData.currency || "USD"}
              onChange={(e) => handleChange("currency", e.target.value)}
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="trial_days" className={labelClass} style={labelStyle}>
              Días de Prueba
            </Label>
            <Input
              id="trial_days"
              type="number"
              value={formData.trial_days ?? 0}
              onChange={(e) =>
                handleChange("trial_days", parseInt(e.target.value, 10) || 0)
              }
              className="col-span-3 rounded-xl border h-11 placeholder:opacity-70"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="is_active" className={labelClass} style={labelStyle}>
              Activo
            </Label>
            <Checkbox
              id="is_active"
              checked={formData.is_active || false}
              onCheckedChange={(checked) => handleChange("is_active", checked)}
              className="rounded-md border-2 border-[var(--platform-fg-muted)] data-[state=checked]:border-[var(--platform-accent)] data-[state=checked]:bg-[var(--platform-accent)]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="rounded-xl"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
