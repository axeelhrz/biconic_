"use server";

// Server Action to invoke the Supabase Edge Function `add-client-member`.
// Authorizes user, calls the function with the provided payload, and returns a
// consistent Spanish response shape.

export interface AddClientMemberInput {
  existingClientId: string; // UUID del cliente existente (empresa)
  userEmail: string;
  userPassword: string;
  userFullName?: string;
  userJobTitle?: string; // puede mapearse desde 'role'
}

export async function addClientMember(input: AddClientMemberInput) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" } as const;

    const payload = {
      existingClientId: input.existingClientId,
      userEmail: input.userEmail,
      userPassword: input.userPassword,
      userFullName: input.userFullName,
      userJobTitle: input.userJobTitle,
    };

    const { data, error } = await supabase.functions.invoke(
      "add-client-member",
      { body: payload }
    );

    if (error) {
      console.error("Function Invoke Error (addClientMember):", error);
      
      let message = error.message || "No se pudo crear el miembro";
      let details = "";
      let code = "";

      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
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

    return { ok: true, userId: (data as any)?.userId } as const;
  } catch (err: any) {
    console.error("Error en addClientMember:", err);
    return { ok: false, error: err?.message ?? "Error interno" } as const;
  }
}
