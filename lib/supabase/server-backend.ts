import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/auth/jwt-config";
import {
  createServiceAdminClient,
  type PostgresServiceQuery,
} from "@/lib/supabase/service-admin-client";

export type ServerAuthUser = {
  id: string;
  email?: string;
  app_role?: string;
};

export async function getServerAuthUser(): Promise<ServerAuthUser | null> {
  const token = (await cookies()).get("biconic_access")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return {
      id: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      app_role: typeof payload.app_role === "string" ? payload.app_role : undefined,
    };
  } catch {
    return null;
  }
}

export async function createServerBackendClient() {
  const user = await getServerAuthUser();
  const admin = createServiceAdminClient();

  return {
    auth: {
      async getUser() {
        if (!user) return { data: { user: null }, error: { message: "No autenticado" } };
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { app_role: user.app_role },
            },
          },
          error: null,
        };
      },
      async getSession() {
        const r = await this.getUser();
        return { data: { session: r.data.user ? { user: r.data.user } : null }, error: null };
      },
    },
    from(table: string): PostgresServiceQuery {
      return admin.from(table);
    },
    schema(schemaName: string) {
      return admin.schema(schemaName);
    },
  };
}
