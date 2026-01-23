"use server";

import { createClient } from "@/lib/supabase/server";
import { Database } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
type PlanInsert = Database["public"]["Tables"]["plans"]["Insert"];
type PlanUpdate = Database["public"]["Tables"]["plans"]["Update"];

export async function getPlans() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("price_monthly", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function upsertPlan(plan: PlanInsert | PlanUpdate) {
  const supabase = await createClient();
  
  // If id is present, it's an update, otherwise insert
  const { data, error } = await supabase
    .from("plans")
    .upsert(plan as any) // Type casting to bypass strict union check, but upsert handles both if ID is present
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/plans");
  return data;
}
