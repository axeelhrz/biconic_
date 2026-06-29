import { Client as PgClient } from "pg";
import { attachFirebird } from "@/lib/firebird-client";

export type TestDatabaseConnectionInput = {
  type: string;
  host: string;
  database: string;
  user: string;
  password?: string;
  port?: number;
};

export type TestDatabaseConnectionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function friendlyFirebirdError(msg: string): string {
  if (msg.includes("ECONNREFUSED")) {
    return "No se pudo conectar al servidor. Revisá host y puerto, y que Firebird esté encendido y accesible.";
  }
  if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) {
    return "No hay ruta hasta el servidor (red inalcanzable). Verificá VPN o firewall si la base es remota.";
  }
  if (
    msg.includes("I/O error") ||
    msg.includes("trying to open file") ||
    msg.includes("open file")
  ) {
    return "No se pudo abrir la base Firebird. Confirmá el path o alias (ej. /var/lib/firebird/data/base.fdb).";
  }
  return msg;
}

export async function testDatabaseConnection(
  input: TestDatabaseConnectionInput
): Promise<TestDatabaseConnectionResult> {
  const type = String(input.type).toLowerCase();
  const port =
    input.port ??
    (type === "firebird" ? 15421 : type === "mysql" ? 3306 : 5432);
  const password =
    input.password ??
    process.env.FLEXXUS_PASSWORD ??
    process.env.DB_PASSWORD_PLACEHOLDER ??
    "";

  if (type === "postgres" || type === "postgresql") {
    const client = new PgClient({
      host: input.host,
      port,
      database: input.database,
      user: input.user,
      password: password || undefined,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return { ok: true, message: "Conexión PostgreSQL exitosa" };
  }

  if (type === "firebird") {
    return await new Promise<TestDatabaseConnectionResult>((resolve) => {
      attachFirebird(
        {
          host: input.host,
          port,
          database: input.database,
          user: input.user,
          password,
        },
        (err, db) => {
          if (err) {
            resolve({
              ok: false,
              error: friendlyFirebirdError(err.message || "Error al conectar con Firebird"),
            });
            return;
          }
          if (db && typeof (db as { detach?: (cb: () => void) => void }).detach === "function") {
            (db as { detach: (cb: () => void) => void }).detach(() => {});
          }
          resolve({ ok: true, message: "Conexión Firebird exitosa" });
        }
      );
    });
  }

  if (type === "mysql") {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({
      host: input.host,
      port,
      database: input.database,
      user: input.user,
      password,
      connectTimeout: 8000,
    });
    await connection.ping();
    await connection.end();
    return { ok: true, message: "Conexión MySQL exitosa" };
  }

  return {
    ok: false,
    error: "Tipo de conexión no soportado. Use postgres, mysql o firebird.",
  };
}
