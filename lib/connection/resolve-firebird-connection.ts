import { decryptConnectionPassword } from "@/lib/connection-secret";
import { hydrateConnectionRow } from "@/lib/connection/connection-persistence";

export type FirebirdAttachOptions = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  lowercase_keys: false;
};

function readConfigPassword(rawConn: Record<string, unknown>): string {
  let cfgRaw = rawConn.config;
  if (typeof cfgRaw === "string") {
    try {
      cfgRaw = JSON.parse(cfgRaw) as Record<string, unknown>;
    } catch {
      return "";
    }
  }
  if (!cfgRaw || typeof cfgRaw !== "object" || Array.isArray(cfgRaw)) return "";
  const cfg = cfgRaw as Record<string, unknown>;
  return String(cfg.password ?? cfg.db_password ?? "").trim();
}

/** Resuelve contraseña Firebird: cifrada, plana en fila/config o variables de entorno. */
export function resolveFirebirdPasswordFromConnection(
  rawConn: Record<string, unknown>
): string {
  const conn = hydrateConnectionRow(rawConn);
  if (conn.db_password_encrypted) {
    const decrypted = decryptConnectionPassword(conn.db_password_encrypted);
    if (decrypted) return decrypted;
  }
  const plain =
    (rawConn.db_password as string | null | undefined) ??
    (conn as { db_password?: string | null }).db_password;
  if (typeof plain === "string" && plain.trim()) return plain.trim();
  const fromConfig = readConfigPassword(rawConn);
  if (fromConfig) return fromConfig;
  return process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "";
}

export function isFirebirdAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /user name and password are not defined/i.test(msg) ||
    /username and password/i.test(msg) ||
    /login/i.test(msg) ||
    /authentication failed/i.test(msg) ||
    /no permission for/i.test(msg)
  );
}

export function isFirebirdColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /-206/i.test(msg) ||
    /column unknown/i.test(msg) ||
    /unknown column/i.test(msg) ||
    /invalid column name/i.test(msg)
  );
}

/** Opciones para node-firebird.attach a partir de una fila connections (con o sin hydrate previo). */
export function resolveFirebirdAttachOptions(
  rawConn: Record<string, unknown>
): FirebirdAttachOptions {
  const conn = hydrateConnectionRow(rawConn);
  const host = String(conn.db_host ?? "").trim();
  const database = String(conn.db_name ?? "").trim();
  const user = String(conn.db_user ?? "").trim();
  const port =
    conn.db_port != null && Number(conn.db_port) > 0 ? Number(conn.db_port) : 15421;

  if (!host) {
    throw new Error(
      "La conexión Firebird no tiene servidor (host) configurado. Editá la conexión en «Conexiones» y guardá el host remoto; no se intenta conectar a localhost."
    );
  }
  if (!database || !user) {
    throw new Error(
      "La conexión Firebird está incompleta (falta base de datos o usuario). Revisá la configuración de la conexión."
    );
  }

  const password = resolveFirebirdPasswordFromConnection(rawConn);

  return {
    host,
    port,
    database,
    user,
    password,
    lowercase_keys: false,
  };
}

/** Mensaje más claro cuando node-firebird no puede conectar. */
export function formatFirebirdConnectError(err: unknown, host?: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (isFirebirdAuthError(err)) {
    return "No se pudo autenticar en Firebird: usuario o contraseña no definidos. Revisá la conexión en «Conexiones» y guardá la contraseña, o configurá FLEXXUS_PASSWORD en el servidor.";
  }
  if (/ECONNREFUSED.*127\.0\.0\.1/i.test(msg) || /ECONNREFUSED.*localhost/i.test(msg)) {
    return host
      ? `No se pudo conectar a Firebird en ${host}. Si el error menciona 127.0.0.1, la conexión no tiene host guardado correctamente.`
      : "No se pudo conectar a Firebird: el servidor quedó en localhost (127.0.0.1). Revisá que la conexión tenga el host remoto guardado en «Conexiones».";
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `No se pudo conectar al servidor Firebird${host ? ` (${host})` : ""}. Verificá host, puerto y que el servidor acepte conexiones externas.`;
  }
  return msg;
}
