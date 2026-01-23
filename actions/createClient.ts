"use server";

// Server Action to invoke the Supabase Edge Function `create-client`.
// It validates auth, maps form values to the function payload, and returns a
// consistent Spanish response shape.

export type ClientType = "empresa" | "individuo";

export interface NewClientForm {
  clientType: ClientType;
  companyName?: string; // Used when clientType = 'empresa'
  companyId?: string; // For individuo belonging to a company
  individualFullName?: string; // Used when clientType = 'individuo'
  identificationType?: string; // cc | nit | pasaporte
  identificationNumber?: string;
  country?: string;
  province?: string;
  capital?: string;
  address?: string;
  // Optional login-like fields collected in the form; we fallback to these if user* are missing
  email?: string;
  password?: string;
  // Commercial plan & status
  planId?: string; // UUID expected by the Edge Function
  status?: "activo" | "inactivo";
  // Limits
  maxUsers?: number;
  maxProjects?: number;
  // Initial member
  userName?: string; // Full name
  userJobTitle?: string; // Cargo (optional)
  role?: "ver" | "editar" | "admin"; // If UI uses role for cargo, we map it to job title
  userEmail?: string;
  userPassword?: string;
}

export async function createNewClient(form: NewClientForm) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" } as const;

    // Build payload expected by the Edge Function
      const payload = {
      clientType: form.clientType,
      companyName:
        form.clientType === "empresa"
          ? form.companyName ?? form.userName ?? ""
          : undefined,
      individualFullName:
        form.clientType === "individuo"
          ? form.individualFullName ?? form.companyName ?? form.userName ?? ""
          : undefined,
      identificationType: form.identificationType ?? "",
      identificationNumber: form.identificationNumber ?? "",
      countryId: form.country ?? "",
      provinceId: form.province ?? "",
      capital: form.capital ?? "",
      address: form.address ?? "",
      planId: form.planId ?? "",
      
      // ELIMINADO: maxUsers y maxProjects ya no se pasan
      contactEmail: form.email || "", 
      userEmail: form.userEmail || form.email || "",
      userPassword: form.userPassword || form.password || undefined,
      userFullName:
        form.userName ||
        (form.clientType === "individuo"
          ? form.individualFullName ?? form.companyName ?? ""
          : form.companyName ?? ""),
      userJobTitle: form.userJobTitle || form.role,
    };

    // Call the Edge Function via Supabase Functions API (server-side, no CORS concerns)
    const { data, error } = await supabase.functions.invoke("create-client", {
      body: payload,
    });

    if (error) {
      console.error("Function Invoke Error:", error);

      let message = error.message || "No se pudo crear el cliente";
      let details = "";
      let code = "";

      // The 'context' property of FunctionsHttpError is the actual Response object.
      // We need to parse it to get the custom JSON we sent from the Edge Function.
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          // If body is not used yet, we can parse it.
          // Note: createClient/invoke might have already tried to read it? 
          // The user logs said "bodyUsed: false", so we are good.
          const errorBody = await context.json();
          message = errorBody.error || message;
          details = errorBody.details || "";
          code = errorBody.code || "";
        } catch (jsonErr) {
          console.error("Failed to parse edge function error response:", jsonErr);
        }
      }

      return {
        ok: false,
        error: message,
        details,
        code,
      } as const;
    }

    return { ok: true, clientId: (data as any)?.clientId } as const;
  } catch (err: any) {
    console.error("Error en createNewClient:", err);
    return { ok: false, error: err?.message ?? "Error interno" } as const;
  }
}
