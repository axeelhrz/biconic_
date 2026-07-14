import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import type { Database } from "@/lib/supabase/database.types";

type Plan = Database["public"]["Tables"]["plans"]["Row"] & { features?: unknown };
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type BillingInterval = Database["public"]["Enums"]["billing_interval"];

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

export async function listPlansFromDb(): Promise<Plan[]> {
  const sql = getSql();
  try {
    return await sql<Plan[]>`
      SELECT *
      FROM public.plans
      ORDER BY price_monthly ASC NULLS LAST, name ASC
    `;
  } finally {
    await sql.end();
  }
}

export async function upsertPlanFromDb(
  plan: Partial<Plan> & { name: string }
): Promise<Plan> {
  const sql = getSql();
  try {
    if (plan.id) {
      const featuresJson =
        plan.features != null ? sql.json(plan.features as any) : null;
      const rows = await sql`
        UPDATE public.plans
        SET
          name = ${plan.name},
          price_monthly = ${plan.price_monthly ?? null},
          price_yearly = ${plan.price_yearly ?? null},
          features = ${featuresJson}
        WHERE id = ${plan.id}
        RETURNING *
      `;
      const row = rows[0] as Plan | undefined;
      if (!row) throw new Error("Plan no encontrado");
      return row;
    }

    const featuresJson =
      plan.features != null ? sql.json(plan.features as any) : null;
    const rows = await sql`
      INSERT INTO public.plans (name, price_monthly, price_yearly, features)
      VALUES (
        ${plan.name},
        ${plan.price_monthly ?? null},
        ${plan.price_yearly ?? null},
        ${featuresJson}
      )
      RETURNING *
    `;
    const row = rows[0] as Plan | undefined;
    if (!row) throw new Error("No se pudo guardar el plan");
    return row;
  } finally {
    await sql.end();
  }
}

export async function updateSubscriptionFromDb(
  subscriptionId: string,
  data: {
    planId?: string;
    status?: SubscriptionStatus;
    billingInterval?: BillingInterval;
  }
) {
  const sql = getSql();
  try {
    const [row] = await sql<{ id: string }[]>`
      UPDATE public.subscriptions
      SET
        plan_id = COALESCE(${data.planId ?? null}, plan_id),
        status = COALESCE(${data.status ?? null}, status),
        billing_interval = COALESCE(${data.billingInterval ?? null}, billing_interval)
      WHERE id = ${subscriptionId}
      RETURNING id
    `;
    if (!row) throw new Error("Suscripción no encontrada");
    return { success: true as const };
  } finally {
    await sql.end();
  }
}

export async function createSubscriptionFromDb(
  clientId: string,
  data: {
    planId: string;
    status: SubscriptionStatus;
    billingInterval: BillingInterval;
  }
) {
  const sql = getSql();
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.subscriptions (client_id, plan_id, status, billing_interval)
      VALUES (${clientId}, ${data.planId}, ${data.status}, ${data.billingInterval})
      RETURNING id
    `;
    if (!row) throw new Error("No se pudo crear la suscripción");
    return { success: true as const };
  } finally {
    await sql.end();
  }
}
