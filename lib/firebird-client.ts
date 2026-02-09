/**
 * Helper para conectar y consultar bases Firebird (Flexxus).
 * La contraseña se obtiene de process.env.FLEXXUS_PASSWORD si no se pasa.
 */

export type FirebirdConnectionOptions = {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string | null;
};

export function getFirebirdPassword(secretId: string | null, envPassword?: string): string {
  if (envPassword) return envPassword;
  return process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "";
}

export function attachFirebird(
  options: FirebirdConnectionOptions,
  callback: (err: Error | null, db: unknown) => void
): void {
  const Firebird = require("node-firebird");
  const password = options.password ?? getFirebirdPassword(null);
  Firebird.attach(
    {
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.user,
      password,
      lowercase_keys: false,
    },
    callback
  );
}

export function queryFirebird(db: any, sql: string, params: unknown[] = []): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err: Error | null, result: unknown[]) => {
      if (err) return reject(err);
      resolve(result || []);
    });
  });
}

export function detachFirebird(db: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db || typeof db.detach !== "function") {
      resolve();
      return;
    }
    db.detach((err: Error | null) => (err ? reject(err) : resolve()));
  });
}
