"use server";

import { getBackendApiUrl } from "@/lib/api/backend-config";

export interface AddClientMemberInput {
  existingClientId: string;
  userEmail: string;
  userPassword: string;
  userFullName?: string;
  userJobTitle?: string;
}

export async function addClientMember(input: AddClientMemberInput) {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" } as const;

    const apiUrl = getBackendApiUrl();
    const cookieStore = await (await import("next/headers")).cookies();
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
        role: "viewer",
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
