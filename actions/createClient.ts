"use server";

import { getBackendApiUrl } from "@/lib/api/backend-config";

export type ClientType = "empresa" | "individuo";

export interface NewClientForm {
  clientType: ClientType;
  companyName?: string;
  companyId?: string;
  individualFullName?: string;
  identificationType?: string;
  identificationNumber?: string;
  country?: string;
  province?: string;
  capital?: string;
  address?: string;
  email?: string;
  password?: string;
  planId?: string;
  status?: "activo" | "inactivo";
  maxUsers?: number;
  maxProjects?: number;
  userName?: string;
  userJobTitle?: string;
  role?: "ver" | "editar" | "admin";
  userEmail?: string;
  userPassword?: string;
}

export async function createNewClient(form: NewClientForm) {
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" } as const;

    const payload = {
      companyName:
        form.clientType === "empresa"
          ? form.companyName ?? form.userName ?? ""
          : undefined,
      individualFullName:
        form.clientType === "individuo"
          ? form.individualFullName ?? form.companyName ?? form.userName ?? ""
          : undefined,
      userEmail: form.userEmail || form.email || "",
      userPassword: form.userPassword || form.password || undefined,
      userFullName:
        form.userName ||
        (form.clientType === "individuo"
          ? form.individualFullName ?? form.companyName ?? ""
          : form.companyName ?? ""),
    };

    const apiUrl = getBackendApiUrl();
    const cookieStore = await (await import("next/headers")).cookies();
    const res = await fetch(`${apiUrl}/admin/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        name: payload.companyName || payload.individualFullName || "Cliente",
        type: form.clientType,
        adminEmail: payload.userEmail,
        adminPassword: payload.userPassword ?? "TempPass123!",
        adminName: payload.userFullName,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.message ?? data?.error ?? "No se pudo crear el cliente",
      } as const;
    }
    return { ok: true, clientId: data?.clientId } as const;
  } catch (err: unknown) {
    console.error("Error en createNewClient:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error interno",
    } as const;
  }
}
