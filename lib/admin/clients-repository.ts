import postgres from "postgres";
import bcrypt from "bcryptjs";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { toSqlParams } from "@/lib/db/sql-params";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { normalizeClientRole } from "@/lib/admin/client-members-repository";
import { createSubscriptionFromDb } from "@/lib/admin/plans-repository";
import type { Database } from "@/lib/supabase/database.types";

type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type BillingInterval = Database["public"]["Enums"]["billing_interval"];

export type AdminClientTableRow = {
  id: string;
  name: string;
  plan: string | null;
  status: string | null;
  dashboards: number;
  members: number;
  location?: string;
  industry?: string | null;
  subscription?: {
    id: string;
    plan_id: string;
    status: SubscriptionStatus;
    billing_interval: BillingInterval;
  } | null;
};

export type ListAdminClientsParams = {
  page: number;
  pageSize: number;
  search?: string;
  filter?: "todos" | "activos" | "inactivos";
};

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") {
    const sql = getSql();
    try {
      const [profile] = await sql<{ app_role: string }[]>`
        SELECT app_role FROM public.profiles WHERE id = ${user.id} LIMIT 1
      `;
      if (profile?.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
    } finally {
      await sql.end();
    }
  }
  return user;
}

type ClientSchema = {
  nameCol: "company_name" | "name";
  hasStatus: boolean;
  hasCapital: boolean;
  hasCountries: boolean;
};

let cachedSchema: ClientSchema | null = null;

async function getClientSchema(sql: ReturnType<typeof postgres>): Promise<ClientSchema> {
  if (cachedSchema) return cachedSchema;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
  `;
  const names = new Set(cols.map((c) => c.column_name));
  const hasCountries = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'countries'
    ) AS exists
  `;
  cachedSchema = {
    nameCol: names.has("company_name") ? "company_name" : "name",
    hasStatus: names.has("status"),
    hasCapital: names.has("capital"),
    hasCountries: hasCountries[0]?.exists === true && names.has("country_id"),
  };
  return cachedSchema;
}

export async function resolveClientNameColumn(
  sql: ReturnType<typeof postgres>
): Promise<"company_name" | "name"> {
  const schema = await getClientSchema(sql);
  return schema.nameCol;
}

function mapSubscription(
  raw: unknown
): { plan: string | null; subscription: AdminClientTableRow["subscription"] } {
  if (!raw || typeof raw !== "object") return { plan: null, subscription: null };
  const sub = raw as {
    id?: string;
    plan_id?: string;
    status?: SubscriptionStatus;
    billing_interval?: BillingInterval;
    plan_name?: string | null;
  };
  if (!sub.id || !sub.plan_id || !sub.status || !sub.billing_interval) {
    return { plan: sub.plan_name ?? null, subscription: null };
  }
  return {
    plan: sub.plan_name ?? null,
    subscription: {
      id: sub.id,
      plan_id: sub.plan_id,
      status: sub.status,
      billing_interval: sub.billing_interval,
    },
  };
}

function displayStatus(
  rawStatus: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  hasStatusCol: boolean
): string | null {
  if (hasStatusCol && rawStatus) return rawStatus;
  if (subscriptionStatus === "active") return "Activo";
  if (subscriptionStatus === "canceled") return "Desactivado";
  return hasStatusCol ? null : "Activo";
}

export async function listAdminClientsFromDb(
  params: ListAdminClientsParams
): Promise<{ rows: AdminClientTableRow[]; total: number }> {
  await requireAppAdmin();
  const sql = getSql();
  const page = Math.max(1, params.page);
  const pageSize = Math.max(1, params.pageSize);
  const offset = (page - 1) * pageSize;
  const search = params.search?.trim() ?? "";
  const filter = params.filter ?? "todos";

  try {
    const schema = await getClientSchema(sql);
    const { nameCol, hasStatus, hasCapital, hasCountries } = schema;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`c.${nameCol} ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    if (filter === "activos" || filter === "inactivos") {
      const target = filter === "activos" ? "Activo" : "Desactivado";
      if (hasStatus) {
        conditions.push(`c.status = $${paramIndex++}`);
        values.push(target);
      } else if (filter === "activos") {
        conditions.push(`(
          NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.client_id = c.id)
          OR EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.client_id = c.id AND s.status = 'active'
          )
        )`);
      } else {
        conditions.push(`EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.client_id = c.id AND s.status <> 'active'
        )`);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const locationExpr = hasCountries && hasCapital
      ? `TRIM(BOTH ', ' FROM CONCAT_WS(', ', NULLIF(TRIM(c.capital), ''), co.name))`
      : hasCapital
        ? `NULLIF(TRIM(c.capital), '')`
        : `NULL`;

    const countQuery = `
      SELECT COUNT(*)::text AS count
      FROM public.clients c
      ${hasCountries ? "LEFT JOIN public.countries co ON co.id = c.country_id" : ""}
      ${whereClause}
    `;
    const [countRow] = await sql.unsafe<{ count: string }[]>(countQuery, toSqlParams(values));
    const total = Number(countRow?.count) || 0;

    const listQuery = `
      SELECT
        c.id::text AS id,
        c.${nameCol} AS company_name,
        ${hasStatus ? "c.status" : "NULL::text"} AS client_status,
        ${locationExpr} AS location,
        (SELECT COUNT(*)::int FROM public.dashboard d WHERE d.client_id = c.id) AS dashboards_count,
        (SELECT COUNT(*)::int FROM public.client_members cm WHERE cm.client_id = c.id) AS members_count,
        (
          SELECT json_build_object(
            'id', s.id,
            'plan_id', s.plan_id,
            'status', s.status,
            'billing_interval', s.billing_interval,
            'plan_name', p.name
          )
          FROM public.subscriptions s
          LEFT JOIN public.plans p ON p.id = s.plan_id
          WHERE s.client_id = c.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) AS subscription
      FROM public.clients c
      ${hasCountries ? "LEFT JOIN public.countries co ON co.id = c.country_id" : ""}
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const listValues = [...values, pageSize, offset];
    const rawRows = await sql.unsafe<
      {
        id: string;
        company_name: string | null;
        client_status: string | null;
        location: string | null;
        dashboards_count: number;
        members_count: number;
        subscription: unknown;
      }[]
    >(listQuery, toSqlParams(listValues));

    const rows: AdminClientTableRow[] = rawRows.map((r) => {
      const { plan, subscription } = mapSubscription(r.subscription);
      const status = displayStatus(
        r.client_status,
        subscription?.status,
        hasStatus
      );
      return {
        id: r.id,
        name: r.company_name?.trim() || "—",
        plan,
        status,
        dashboards: r.dashboards_count ?? 0,
        members: r.members_count ?? 0,
        location: r.location?.trim() || "—",
        industry: "Tecnología",
        subscription,
      };
    });

    return { rows, total };
  } finally {
    await sql.end();
  }
}

export async function listCompanyOptionsFromDb(): Promise<{ id: string; name: string }[]> {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const schema = await getClientSchema(sql);
    const { nameCol } = schema;

    return await sql.unsafe<{ id: string; name: string }[]>(
      `
      SELECT c.id::text AS id,
        COALESCE(NULLIF(TRIM(c.${nameCol}), ''), 'Sin nombre') AS name
      FROM public.clients c
      ORDER BY c.${nameCol} ASC
      `
    );
  } finally {
    await sql.end();
  }
}

export async function deleteClientsFromDb(clientIds: string[]) {
  await requireAppAdmin();
  if (clientIds.length === 0) return { ok: true as const };
  const sql = getSql();
  try {
    const deleted = await sql<{ id: string }[]>`
      DELETE FROM public.clients WHERE id = ANY(${clientIds}::uuid[]) RETURNING id
    `;
    if (deleted.length === 0) throw new Error("No se encontraron clientes para eliminar");
    return { ok: true as const };
  } finally {
    await sql.end();
  }
}

export type CreateClientInDbInput = {
  clientType: "empresa" | "individuo";
  companyName?: string;
  individualFullName?: string;
  identificationType?: string;
  identificationNumber?: string;
  countryId?: string;
  provinceId?: string;
  capital?: string;
  address?: string;
  contactEmail?: string;
  status?: "activo" | "inactivo";
  planId?: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  adminRole?: string;
};

async function getClientColumnSet(sql: ReturnType<typeof postgres>): Promise<Set<string>> {
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
  `;
  return new Set(cols.map((c) => c.column_name));
}

function pickClientInsertRow(
  input: CreateClientInDbInput,
  schema: ClientSchema,
  cols: Set<string>
): Record<string, unknown> {
  const displayName =
    input.clientType === "empresa"
      ? input.companyName?.trim() || "Cliente"
      : input.individualFullName?.trim() || "Cliente";

  const row: Record<string, unknown> = {
    type: input.clientType,
  };

  if (schema.nameCol === "company_name") {
    if (input.clientType === "empresa" || !cols.has("individual_full_name")) {
      row.company_name = displayName;
    }
    if (cols.has("individual_full_name") && input.clientType === "individuo") {
      row.individual_full_name = input.individualFullName?.trim() || displayName;
    }
  } else if (cols.has("name")) {
    row.name = displayName;
  }

  if (cols.has("identification_type") && input.identificationType?.trim()) {
    row.identification_type = input.identificationType.trim();
  }
  if (cols.has("identification_number") && input.identificationNumber?.trim()) {
    row.identification_number = input.identificationNumber.trim();
  }
  if (schema.hasCountries && cols.has("country_id") && input.countryId?.trim()) {
    row.country_id = input.countryId.trim();
  }
  if (cols.has("province_id") && input.provinceId?.trim()) {
    row.province_id = input.provinceId.trim();
  }
  if (cols.has("capital") && input.capital?.trim()) row.capital = input.capital.trim();
  if (cols.has("address") && input.address?.trim()) row.address = input.address.trim();
  if (cols.has("contact_email") && input.contactEmail?.trim()) {
    row.contact_email = input.contactEmail.trim();
  }
  if (cols.has("status") && schema.hasStatus) {
    row.status = input.status === "inactivo" ? "Desactivado" : "Activo";
  }

  return row;
}

/** Crea cliente, usuario admin y suscripción opcional. */
export async function createClientInDb(
  input: CreateClientInDbInput
): Promise<{ clientId: string; userId: string }> {
  await requireAppAdmin();
  const sql = getSql();
  const email = input.adminEmail.trim().toLowerCase();
  if (!email) throw new Error("El email del administrador es requerido");
  if (!input.adminPassword?.trim()) throw new Error("La contraseña es requerida");

  try {
    const schema = await getClientSchema(sql);
    const cols = await getClientColumnSet(sql);
    const insertRow = pickClientInsertRow(input, schema, cols);

    const [client] = await sql<{ id: string }[]>`
      INSERT INTO public.clients ${sql(insertRow)}
      RETURNING id
    `;
    if (!client?.id) throw new Error("No se pudo crear el cliente");

    let userId: string | undefined;
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM public.profiles WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      userId = existing[0]!.id;
    } else {
      const passwordHash = await bcrypt.hash(input.adminPassword, 12);
      const [user] = await sql<{ id: string }[]>`
        INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
        VALUES (gen_random_uuid(), ${email}, ${input.adminName?.trim() || null}, ${passwordHash}, 'CREATOR'::public.app_role)
        RETURNING id
      `;
      userId = user?.id;
    }
    if (!userId) throw new Error("No se pudo crear el usuario administrador");

    const memberRole = normalizeClientRole(input.adminRole);
    await sql`
      INSERT INTO public.client_members (client_id, user_id, role)
      VALUES (${client.id}, ${userId}, ${memberRole}::public.client_role)
      ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;

    const planId = input.planId?.trim();
    if (planId) {
      const subStatus: Database["public"]["Enums"]["subscription_status"] =
        input.status === "inactivo" ? "canceled" : "active";
      await createSubscriptionFromDb(client.id, {
        planId,
        status: subStatus,
        billingInterval: "month",
      });
    }

    return { clientId: client.id, userId };
  } finally {
    await sql.end();
  }
}
