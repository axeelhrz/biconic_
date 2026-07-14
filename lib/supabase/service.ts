import { createServiceRoleOrAdminClient } from "./service-admin-client";

/** Cliente admin: Supabase service role o Postgres local si USE_OWN_BACKEND=true. */
export const createServiceRoleClient = () => createServiceRoleOrAdminClient();
