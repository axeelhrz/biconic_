"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pencil, Plus } from "lucide-react";
import { Database } from "@/lib/supabase/database.types";
import EditPlanDialog from "./EditPlanDialog";
import { getPlans } from "@/actions/plans";

type Plan = Database["public"]["Tables"]["plans"]["Row"];

export default function AdminPlansTable() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await getPlans();
      setPlans(data || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      {/* Barra: Nuevo plan */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 mb-4"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
        }}
      >
        <Button
          type="button"
          onClick={handleCreate}
          className="rounded-lg h-9 gap-2"
          style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
        >
          <Plus className="h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      <div
        className="w-full overflow-hidden rounded-xl border shadow-sm"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
        }}
      >
        {/* Table header */}
        <div
          className="flex items-center justify-between gap-4 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)", color: "var(--platform-fg-muted)" }}
        >
          <div className="w-[200px]">Nombre</div>
          <div className="flex-1 min-w-0">Descripción</div>
          <div className="w-[120px]">Precio mensual</div>
          <div className="w-[120px]">Precio anual</div>
          <div className="w-[100px]">Estado</div>
          <div className="w-[100px] text-center">Acciones</div>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
          {loading && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Cargando planes...
            </div>
          )}
          {!loading && plans.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              No hay planes registrados.
            </div>
          )}
          {!loading &&
            plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm align-middle"
                style={{ color: "var(--platform-fg)" }}
              >
                <div className="w-[200px] font-medium truncate">{p.name}</div>
                <div className="flex-1 min-w-0 truncate" style={{ color: "var(--platform-fg-muted)" }}>
                  {p.description || "—"}
                </div>
                <div className="w-[120px]">
                  {p.currency} {p.price_monthly}
                </div>
                <div className="w-[120px]">
                  {p.currency} {p.price_yearly}
                </div>
                <div className="w-[100px]">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                      p.is_active ? "bg-[var(--platform-success-dim)]" : "bg-[var(--platform-danger)]/10"
                    )}
                    style={{
                      color: p.is_active ? "var(--platform-success)" : "var(--platform-danger)",
                    }}
                  >
                    {p.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="flex w-[100px] items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(p)}
                    className="h-8 w-8 rounded-lg"
                    style={{ color: "var(--platform-fg)" }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>

      <EditPlanDialog
        plan={editingPlan}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSaved={loadPlans}
      />
    </>
  );
}
