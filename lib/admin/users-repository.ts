import { createRequire } from "node:module";
import { join } from "node:path";
import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { toSqlParams } from "@/lib/db/sql-params";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AdminUser,
  AdminUserStatus,
  CompanyAccess,
  GetAdminUsersParams,
  UserForEdit,
} from "@/app/admin/(main)/users/actions";

const require = createRequire(import.meta.url);
const bcrypt = require(join(process.cwd(), "backend/node_modules/bcryptjs")) as {
  hash: (password: string, rounds: number) => Promise<string>;
};

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
  return user;
}

export async function listAdminUsersFromDb(params: GetAdminUsersParams = {}) {
  await requireAppAdmin();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
  const search = (params.search ?? "").trim().toLowerCase();
  const offset = (page - 1) * pageSize;
  const sql = getSql();

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(
        `(lower(coalesce(p.full_name, '')) LIKE $${idx} OR lower(coalesce(p.email, '')) LIKE $${idx})`
      );
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRows = await sql.unsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM public.profiles p ${where}`,
      toSqlParams(values)
    );
    const total = Number(countRows[0]?.count ?? 0);

    const profiles = await sql.unsafe<
      Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        created_at: string;
        app_role: string;
        avatar_url: string | null;
      }>
    >(
      `SELECT p.id, p.full_name, p.email, p.created_at, p.app_role::text, p.avatar_url
       FROM public.profiles p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      toSqlParams([...values, pageSize, offset])
    );

    const userIds = profiles.map((p) => p.id);
    let companiesMap: Record<string, CompanyAccess[]> = {};

    if (userIds.length > 0) {
      const members = await sql.unsafe<
        Array<{
          id: string;
          user_id: string;
          role: string;
          client_id: string;
          client_name: string;
        }>
      >(
        `SELECT cm.id, cm.user_id, cm.role::text, cm.client_id, c.name AS client_name
         FROM public.client_members cm
         JOIN public.clients c ON c.id = cm.client_id
         WHERE cm.user_id = ANY($1::uuid[])`,
        [userIds]
      );

      const clientIds = [...new Set(members.map((m) => m.client_id))];
      const dashboardsMap: Record<string, { id: string; title: string }[]> = {};

      if (clientIds.length > 0) {
        const dashboards = await sql.unsafe<
          Array<{ id: string; title: string | null; client_id: string }>
        >(
          `SELECT id, title, client_id FROM public.dashboard WHERE client_id = ANY($1::uuid[])`,
          [clientIds]
        );
        for (const d of dashboards) {
          if (!dashboardsMap[d.client_id]) dashboardsMap[d.client_id] = [];
          dashboardsMap[d.client_id].push({
            id: d.id,
            title: d.title ?? "Sin título",
          });
        }
      }

      for (const m of members) {
        if (!companiesMap[m.user_id]) companiesMap[m.user_id] = [];
        companiesMap[m.user_id].push({
          id: m.client_id,
          memberId: m.id,
          name: m.client_name,
          role: m.role as CompanyAccess["role"],
          dashboards: dashboardsMap[m.client_id] ?? [],
        });
      }
    }

    const users: AdminUser[] = profiles.map((r) => ({
      id: r.id,
      name: r.full_name ?? "—",
      email: r.email ?? "—",
      activeSince: r.created_at,
      companies: companiesMap[r.id] ?? [],
      status: "activo" as AdminUserStatus,
      app_role: r.app_role as Database["public"]["Enums"]["app_role"],
      avatarUrl:
        r.avatar_url ?? `https://secure.gravatar.com/avatar/${r.id}?d=mp`,
    }));

    return { users, total, page, pageSize };
  } finally {
    await sql.end();
  }
}

export async function createAdminUserInDb(input: {
  email: string;
  password: string;
  fullName?: string;
  appRole?: Database["public"]["Enums"]["app_role"];
}) {
  await requireAppAdmin();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() || null;
  const appRole = input.appRole ?? "VIEWER";

  try {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM public.profiles WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("El email ya está registrado");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const rows = await sql<{ id: string }[]>`
      INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
      VALUES (gen_random_uuid(), ${email}, ${fullName}, ${passwordHash}, ${appRole}::public.app_role)
      RETURNING id
    `;
    return { id: rows[0]?.id };
  } finally {
    await sql.end();
  }
}

export async function deleteUsersFromDb(userIds: string[]) {
  await requireAppAdmin();
  if (userIds.length === 0) return;
  const auth = await getServerAuthUser();
  const filtered = userIds.filter((id) => id !== auth?.id);
  if (filtered.length === 0) {
    throw new Error("No podés eliminar tu propio usuario");
  }

  const sql = getSql();
  try {
    await sql`DELETE FROM public.profiles WHERE id = ANY(${filtered}::uuid[])`;
  } finally {
    await sql.end();
  }
}

export async function updateUserAppRoleInDb(
  userId: string,
  role: Database["public"]["Enums"]["app_role"]
) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    await sql`
      UPDATE public.profiles SET app_role = ${role}::public.app_role, updated_at = now()
      WHERE id = ${userId}
    `;
  } finally {
    await sql.end();
  }
}

export async function getUserByIdFromDb(userId: string): Promise<UserForEdit> {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const rows = await sql<
      Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        app_role: string;
        avatar_url: string | null;
      }>
    >`
      SELECT id, full_name, email, app_role::text, avatar_url
      FROM public.profiles WHERE id = ${userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Usuario no encontrado");
    return {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      job_title: null,
      app_role: row.app_role as Database["public"]["Enums"]["app_role"],
      role: "activo",
      avatar_url: row.avatar_url,
    };
  } finally {
    await sql.end();
  }
}

export async function updateUserInDb(params: {
  userId: string;
  full_name?: string;
  app_role?: Database["public"]["Enums"]["app_role"];
  avatar_url?: string | null;
}) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    if (params.full_name !== undefined) {
      await sql`UPDATE public.profiles SET full_name = ${params.full_name}, updated_at = now() WHERE id = ${params.userId}`;
    }
    if (params.app_role !== undefined) {
      await sql`UPDATE public.profiles SET app_role = ${params.app_role}::public.app_role, updated_at = now() WHERE id = ${params.userId}`;
    }
    if (params.avatar_url !== undefined) {
      await sql`UPDATE public.profiles SET avatar_url = ${params.avatar_url}, updated_at = now() WHERE id = ${params.userId}`;
    }
  } finally {
    await sql.end();
  }
}
