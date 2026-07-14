"use server";

import { createClientInDb } from "@/lib/admin/clients-repository";

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
    const adminEmail = (form.userEmail || form.email || "").trim();
    const adminPassword = form.userPassword || form.password || "";
    const adminName =
      form.userName ||
      (form.clientType === "individuo"
        ? form.individualFullName ?? form.companyName ?? ""
        : form.companyName ?? "");

    const { clientId } = await createClientInDb({
      clientType: form.clientType,
      companyName: form.companyName,
      individualFullName: form.individualFullName,
      identificationType: form.identificationType,
      identificationNumber: form.identificationNumber,
      countryId: form.country,
      provinceId: form.province,
      capital: form.capital,
      address: form.address,
      contactEmail: form.email,
      status: form.status,
      planId: form.planId,
      adminEmail,
      adminPassword,
      adminName,
      adminRole: form.role ?? form.userJobTitle,
    });

    return { ok: true, clientId } as const;
  } catch (err: unknown) {
    console.error("Error en createNewClient:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error interno",
    } as const;
  }
}
