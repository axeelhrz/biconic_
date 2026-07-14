import type { Database } from "@/lib/supabase/database.types";

type ClientRole = Database["public"]["Enums"]["client_role"];

export const CLIENT_ROLE_OPTIONS: { label: string; value: ClientRole }[] = [
  { label: "Viewer — solo lectura", value: "viewer" },
  { label: "Editor — puede editar", value: "editor" },
  { label: "Admin — administrador del cliente", value: "admin" },
];
