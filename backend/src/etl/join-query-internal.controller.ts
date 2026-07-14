import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { callJoinQueryForEtl } from "@/lib/connection/call-join-query-for-etl";
import { createEtlPipelineContext } from "@/lib/etl/etl-run-context";

@Controller("internal/connection")
export class JoinQueryInternalController {
  @Post("join-query")
  async joinQuery(
    @Body() body: Record<string, unknown>,
    @Headers("x-internal-etl") internalSecret?: string
  ) {
    const expected =
      process.env.INTERNAL_ETL_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim();
    if (expected && internalSecret !== expected) {
      throw new UnauthorizedException("No autorizado");
    }

    const ctx = createEtlPipelineContext({
      internalEtlSecret: internalSecret ?? expected ?? "",
    });

    try {
      // En Railway no ejecutar join-query in-process: importa rutas Next y puede
      // tumbar el contenedor (OOM). callJoinQueryForEtl prioriza HTTP a Vercel.
      const result = await callJoinQueryForEtl(body, ctx);
      if (!result.ok) {
        return { ok: false, error: result.error || "JOIN falló" };
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `JOIN no disponible (${message}). Configurá NEXT_INTERNAL_URL con la URL de Vercel.`,
      };
    }
  }
}
