"use server";

import { Database } from "@/lib/supabase/database.types";
import { revalidatePath } from "next/cache";
import {
  createSubscriptionFromDb,
  updateSubscriptionFromDb,
} from "@/lib/admin/plans-repository";

export async function updateSubscription(
  subscriptionId: string,
  data: {
    planId?: string;
    status?: Database["public"]["Enums"]["subscription_status"];
    billingInterval?: Database["public"]["Enums"]["billing_interval"];
  }
) {
  const res = await updateSubscriptionFromDb(subscriptionId, data);
  revalidatePath("/admin/clients");
  return res;
}

export async function createSubscription(
  clientId: string,
  data: {
    planId: string;
    status: Database["public"]["Enums"]["subscription_status"];
    billingInterval: Database["public"]["Enums"]["billing_interval"];
  }
) {
  const res = await createSubscriptionFromDb(clientId, data);
  revalidatePath("/admin/clients");
  return res;
}
