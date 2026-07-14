import bcrypt from "bcryptjs";
import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import type { Database } from "@/lib/supabase/database.types";

type ClientRole = Database["public"]["Enums"]["client_role"];

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
  return user;
}

export function normalizeClientRole(role?: string): ClientRole {
  const r = (role ?? "viewer").toLowerCase();
  if (r === "ver" || r === "viewer") return "viewer";
  if (r === "editar" || r === "editor") return "editor";
  if (r === "admin") return "admin";
  return "viewer";
}

export async function searchUsersInDb(query: string, limit = 10) {
  await requireAppAdmin();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const sql = getSql();
  try {
    return await sql<
      Array<{ id: string; email: string | null; full_name: string | null }>
    >`
      SELECT id, email, full_name
      FROM public.profiles
      WHERE lower(coalesce(full_name, '')) LIKE ${`%${q}%`}
         OR lower(coalesce(email, '')) LIKE ${`%${q}%`}
      ORDER BY full_name NULLS LAST
      LIMIT ${limit}
    `;
  } finally {
    await sql.end();
  }
}

export async function addClientMemberInDb(
  clientId: string,
  userId: string,
  role: string
) {
  await requireAppAdmin();
  const sql = getSql();
  const clientRole = normalizeClientRole(role);
  try {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM public.client_members
      WHERE client_id = ${clientId} AND user_id = ${userId}
      LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("El usuario ya es miembro de este cliente");
    }

    await sql`
      INSERT INTO public.client_members (client_id, user_id, role)
      VALUES (${clientId}, ${userId}, ${clientRole}::public.client_role)
    `;
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (code === "23505" || msg.includes("unique") || msg.includes("23505")) {
      throw new Error(
        "Este usuario ya pertenece a otra empresa y no puede ser añadido aquí."
      );
    }
    throw err;
  } finally {
    await sql.end();
  }
}

export async function createUserAndAddToClientInDb(input: {
  clientId: string;
  email: string;
  password: string;
  fullName?: string;
  role: string;
}) {
  await requireAppAdmin();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();
  const clientRole = normalizeClientRole(input.role);
  try {
    let userId: string | undefined;
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM public.profiles WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const rows = await sql<{ id: string }[]>`
        INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
        VALUES (gen_random_uuid(), ${email}, ${input.fullName?.trim() || null}, ${passwordHash}, 'VIEWER'::public.app_role)
        RETURNING id
      `;
      userId = rows[0]?.id;
    }
    if (!userId) throw new Error("No se pudo crear el usuario");

    await sql`
      INSERT INTO public.client_members (client_id, user_id, role)
      VALUES (${input.clientId}, ${userId}, ${clientRole}::public.client_role)
      ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;
    return { userId };
  } finally {
    await sql.end();
  }
}

export async function getUserClientAssignmentFromDb(userId: string) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const { resolveClientNameColumn } = await import("@/lib/admin/clients-repository");
    const nameCol = await resolveClientNameColumn(sql);
    const rows = await sql.unsafe<
      Array<{
        member_id: string;
        client_id: string;
        role: string;
        client_name: string;
      }>
    >(
      `
      SELECT cm.id::text AS member_id,
             cm.client_id::text AS client_id,
             cm.role::text AS role,
             COALESCE(NULLIF(TRIM(c.${nameCol}), ''), 'Sin nombre') AS client_name
      FROM public.client_members cm
      JOIN public.clients c ON c.id = cm.client_id
      WHERE cm.user_id = $1::uuid
      ORDER BY cm.created_at ASC
      LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      memberId: row.member_id,
      clientId: row.client_id,
      clientName: row.client_name,
      role: row.role as ClientRole,
    };
  } finally {
    await sql.end();
  }
}

export async function setUserClientAssignmentInDb(
  userId: string,
  clientId: string | null | undefined,
  role?: string
) {
  await requireAppAdmin();
  const sql = getSql();
  const clientRole = normalizeClientRole(role);
  try {
    if (!clientId) {
      await sql`DELETE FROM public.client_members WHERE user_id = ${userId}`;
      return;
    }

    await sql`
      DELETE FROM public.client_members
      WHERE user_id = ${userId} AND client_id <> ${clientId}::uuid
    `;
    await sql`
      INSERT INTO public.client_members (client_id, user_id, role)
      VALUES (${clientId}::uuid, ${userId}, ${clientRole}::public.client_role)
      ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;
  } finally {
    await sql.end();
  }
}

export async function getClientUsersFromDb(clientId: string) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const members = await sql<
      Array<{
        id: string;
        user_id: string;
        role: string;
        created_at: string;
      }>
    >`
      SELECT id, user_id, role::text, created_at
      FROM public.client_members
      WHERE client_id = ${clientId}
      ORDER BY created_at DESC
    `;
    if (members.length === 0) return [];

    const userIds = members.map((m) => m.user_id);
    const profiles = await sql<
      Array<{ id: string; full_name: string | null; email: string | null }>
    >`
      SELECT id, full_name, email
      FROM public.profiles
      WHERE id = ANY(${userIds}::uuid[])
    `;
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return members.map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        fullName: p?.full_name ?? "—",
        email: p?.email ?? "—",
        role: m.role as ClientRole,
        isActive: true,
        joinedAt: m.created_at,
      };
    });
  } finally {
    await sql.end();
  }
}
