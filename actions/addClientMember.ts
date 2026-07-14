"use server";

import { getBackendApiUrl } from "@/lib/api/backend-config";
import { normalizeClientRole } from "@/lib/admin/client-members-repository";
import { getServerAuthUser } from "@/lib/supabase/server-backend";

export interface AddClientMemberInput {
  existingClientId: string;
  userEmail: string;
  userPassword: string;
  userFullName?: string;
  userJobTitle?: string;
  role?: string;
}

export async function addClientMember(input: AddClientMemberInput) {
  try {
    const user = await getServerAuthUser();
    if (!user) return { ok: false, error: "No autorizado" } as const;

    const apiUrl = getBackendApiUrl();
    const cookieStore = await (await import("next/headers")).cookies();
    const role = normalizeClientRole(input.role ?? input.userJobTitle);
    const res = await fetch(`${apiUrl}/admin/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        clientId: input.existingClientId,
        email: input.userEmail,
        password: input.userPassword,
        fullName: input.userFullName,
        role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.message ?? data?.error ?? "No se pudo crear el miembro",
      } as const;
    }
    return { ok: true, userId: data?.userId } as const;
  } catch (err: unknown) {
    console.error("Error en addClientMember:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error interno",
    } as const;
  }
}
