"use server";

import { Database } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";
import { listPlansFromDb, upsertPlanFromDb } from "@/lib/admin/plans-repository";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
type PlanInsert = Database["public"]["Tables"]["plans"]["Insert"];
type PlanUpdate = Database["public"]["Tables"]["plans"]["Update"];

export async function getPlans(): Promise<Plan[]> {
  return listPlansFromDb();
}

export async function upsertPlan(plan: PlanInsert | PlanUpdate) {
  const saved = await upsertPlanFromDb(plan as Partial<Plan> & { name: string });
  revalidatePath("/admin/plans");
  return saved;
}
