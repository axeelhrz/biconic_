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
    <div className="flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border border-[#ECECEC] bg-[#FDFDFD] px-10 py-8">
      {/* Subheader */}
      <div className="flex items-center justify-between">
        <h2 className="font-exo2 text-[20px] font-semibold text-[#00030A]">
          Planes
        </h2>
        <Button
          variant="outline"
          className="h-[34px] rounded-full border-[#0F5F4C] text-[#0F5F4C]"
          onClick={handleCreate}
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo Plan
        </Button>
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between gap-4 border-b border-[#D9DCE3] px-[15px] py-[3px] text-[12px] font-semibold text-[#54565B]">
        <div className="w-[200px]">Nombre</div>
        <div className="flex-1">Descripción</div>
        <div className="w-[120px]">Precio Mensual</div>
        <div className="w-[120px]">Precio Anual</div>
        <div className="w-[100px]">Estado</div>
        <div className="w-[100px] text-center">Acciones</div>
      </div>

      {/* Table rows */}
      <div className="divide-y divide-[#D9DCE3]">
        {loading && (
           <div className="px-4 py-8 text-center text-sm text-gray-500">
             Cargando planes...
           </div>
        )}
        {!loading && plans.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No hay planes registrados.
          </div>
        )}
        {!loading &&
          plans.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-4 px-[15px] py-2.5 text-sm text-[#282828]"
            >
              <div className="w-[200px] font-medium">{p.name}</div>
              <div className="flex-1 truncate text-[#54565B]">
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
                    "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium",
                    p.is_active
                      ? "bg-[#E7FFE4] text-[#282828]"
                      : "bg-[#FFEAEB] text-[#282828]"
                  )}
                >
                  {p.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="flex w-[100px] items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(p)}
                  className="h-8 w-8 hover:bg-gray-100"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
      </div>

      <EditPlanDialog
        plan={editingPlan}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSaved={loadPlans}
      />
    </div>
  );
}
