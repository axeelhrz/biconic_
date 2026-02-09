import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Client as PgClient } from "pg";

type TestBody = {
  type: string;
  host: string;
  database: string;
  user: string;
  password?: string;
  port?: number;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as TestBody | null;
    if (!body?.type || !body.host || !body.database || !body.user) {
      return NextResponse.json(
        { ok: false, error: "Faltan tipo, host, base de datos o usuario" },
        { status: 400 }
      );
    }

    const type = String(body.type).toLowerCase();
    const port = body.port ?? (type === "firebird" ? 15421 : 5432);
    const password = body.password ?? process.env.FLEXXUS_PASSWORD ?? process.env.DB_PASSWORD_PLACEHOLDER ?? "";

    if (type === "postgres" || type === "postgresql") {
      const client = new PgClient({
        host: body.host,
        port,
        database: body.database,
        user: body.user,
        password: password || undefined,
        connectionTimeoutMillis: 8000,
      });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return NextResponse.json({ ok: true, message: "Conexión PostgreSQL exitosa" });
    }

    if (type === "firebird") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Firebird = require("node-firebird");
      return await new Promise<NextResponse>((resolve) => {
        const options = {
          host: body.host,
          port,
          database: body.database,
          user: body.user,
          password: password || "",
          lowercase_keys: false,
        };
        Firebird.attach(options, (err: Error | null, db: { detach?: (cb: (e: Error | null) => void) => void }) => {
          if (err) {
            const msg = err.message || "Error al conectar con Firebird";
            let friendly = msg;
            if (msg.includes("ECONNREFUSED")) {
              friendly = "No se pudo conectar al servidor. Revisá que el host y el puerto sean correctos y que el servidor Firebird esté encendido y accesible.";
            } else if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) {
              friendly = "No hay ruta hasta el servidor (red inalcanzable). Revisá que el Host sea exactamente: mngservicios.flexxus.com.ar (y no el path de la base). Si estás en una red local, el servidor Flexxus debe ser accesible desde tu red o VPN.";
            }
            resolve(
              NextResponse.json({ ok: false, error: friendly })
            );
            return;
          }
          if (db?.detach) db.detach(() => {});
          resolve(NextResponse.json({ ok: true, message: "Conexión Firebird (Flexxus) exitosa" }));
        });
      });
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de conexión no soportado para test. Use postgres o firebird." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al probar la conexión";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
