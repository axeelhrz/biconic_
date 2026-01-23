"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
} from "@/components/ui/Select"; // Correct import of custom component
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateSubscription, createSubscription } from "@/actions/subscriptions";
import { getPlans } from "@/actions/plans";
import { Database } from "@/lib/supabase/database.types";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type BillingInterval = Database["public"]["Enums"]["billing_interval"];

interface EditSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string; // Required for creation
  subscription: {
    id: string;
    plan_id: string;
    status: SubscriptionStatus;
    billing_interval: BillingInterval;
  } | null;
  onSaved?: () => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trialing" },
  { value: "past_due", label: "Past Due" },
  { value: "canceled", label: "Canceled" },
  { value: "incomplete", label: "Incomplete" },
  { value: "expired", label: "Expired" },
];

const INTERVAL_OPTIONS: { value: string; label: string }[] = [
  { value: "month", label: "Mensual" },
  { value: "year", label: "Anual" },
];

export default function EditSubscriptionDialog({
  open,
  onOpenChange,
  clientId,
  subscription,
  onSaved,
}: EditSubscriptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Form State
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [interval, setInterval] = useState<BillingInterval>("month");

  useEffect(() => {
    if (open) {
      if (subscription) {
        setPlanId(subscription.plan_id);
        setStatus(subscription.status);
        setInterval(subscription.billing_interval);
      } else {
        // Defaults for new subscription
        setPlanId("");
        setStatus("active");
        setInterval("month");
      }
      loadPlans();
    }
  }, [open, subscription]);

  const loadPlans = async () => {
    setLoadingPlans(true);
    try {
      const data = await getPlans();
      setPlans(data);
    } catch (error) {
      console.error("Error loading plans:", error);
      toast.error("Error al cargar planes");
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleSave = async () => {
    if (!planId) {
      toast.error("Debe seleccionar un plan");
      return;
    }

    setLoading(true);
    try {
      if (subscription) {
        await updateSubscription(subscription.id, {
          planId,
          status,
          billingInterval: interval,
        });
        toast.success("Suscripción actualizada correctamente");
      } else {
        await createSubscription(clientId, {
          planId,
          status,
          billingInterval: interval,
        });
        toast.success("Suscripción creada correctamente");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Error al guardar suscripción");
    } finally {
      setLoading(false);
    }
  };

  const planOptions = plans.map(p => ({
    value: p.id,
    label: `${p.name} - $${p.price_monthly}/mes`
  }));

  const title = subscription ? "Editar Suscripción" : "Asignar Suscripción";
  const btnText = loading ? "Guardando..." : subscription ? "Guardar Cambios" : "Crear Suscripción";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="plan">Plan</Label>
            <Select
              value={planId}
              onChange={(val: string) => setPlanId(val)}
              options={planOptions}
              disabled={loadingPlans || loading}
              placeholder="Seleccione un plan"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status">Estado</Label>
            <Select
              value={status}
              onChange={(val: string) => setStatus(val as SubscriptionStatus)}
              options={STATUS_OPTIONS}
              disabled={loading}
              placeholder="Seleccione estado"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="interval">Facturación</Label>
            <Select
              value={interval}
              onChange={(val: string) => setInterval(val as BillingInterval)}
              options={INTERVAL_OPTIONS}
              disabled={loading}
              placeholder="Intervalo"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {btnText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
