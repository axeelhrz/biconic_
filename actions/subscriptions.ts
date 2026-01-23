"use server";

import { createClient } from "@/lib/supabase/server";
import { Database } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";

type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

export async function updateSubscription(
  subscriptionId: string,
  data: {
    planId?: string;
    status?: Database["public"]["Enums"]["subscription_status"];
    billingInterval?: Database["public"]["Enums"]["billing_interval"];
  }
) {
  const supabase = await createClient();

  const updatePayload: SubscriptionUpdate = {};
  if (data.planId) updatePayload.plan_id = data.planId;
  if (data.status) updatePayload.status = data.status;
  if (data.billingInterval) updatePayload.billing_interval = data.billingInterval;

  const { error } = await supabase
    .from("subscriptions")
    .update(updatePayload)
    .eq("id", subscriptionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/clients");
  return { success: true };
}

export async function createSubscription(
  clientId: string,
  data: {
    planId: string;
    status: Database["public"]["Enums"]["subscription_status"];
    billingInterval: Database["public"]["Enums"]["billing_interval"];
  }
) {
  const supabase = await createClient();

  const { error } = await supabase.from("subscriptions").insert({
    client_id: clientId,
    plan_id: data.planId,
    status: data.status,
    billing_interval: data.billingInterval,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString(), // Default 30 days
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/clients");
  return { success: true };
}
