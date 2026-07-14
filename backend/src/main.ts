import "reflect-metadata";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

/**
 * Registra el alias "@/*" para que el código compartido con Next.js (imports
 * "@/lib/..." / "@/app/...") resuelva en runtime. `tsx -r ./register-paths.js`
 * ya lo hace en desarrollo (mapea a los .ts fuente en la raíz del repo); pero
 * `node dist/backend/src/main.js` (start:prod) no pasa por ese flag, así que acá
 * se registra apuntando al propio directorio compilado (dist/), que refleja la
 * misma estructura (dist/lib, dist/app) que el código fuente (lib/, app/).
 *
 * Se busca subiendo directorios desde __dirname en vez de asumir una profundidad
 * fija, porque el rootDir que infiere TypeScript (y por ende dist/) puede cambiar.
 */
function ensurePathAliasesRegistered(): void {
  try {
    // Si algo ya registró el alias (p. ej. tsx -r ./register-paths.js en dev), no hacer nada más.
    require.resolve("@/lib/etl/limits");
    return;
  } catch {
    /* no registrado todavía: seguir */
  }
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "lib")) && existsSync(resolve(dir, "app"))) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("tsconfig-paths").register({ baseUrl: dir, paths: { "@/*": ["*"] } });
      } catch {
        /* tsconfig-paths no disponible */
      }
      return;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
}
ensurePathAliasesRegistered();

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

const envCandidates = [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), "../.env.local"),
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];
for (const envPath of envCandidates) {
  config({ path: envPath });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Upload-Token", "x-upload-token"],
    exposedHeaders: ["ETag"],
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Biconic backend listening on :${port}`);
}

bootstrap();
