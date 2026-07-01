import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

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

    try {
      const { executeJoinQueryForEtlRun } = await import(
        "@/lib/connection/join-query-internal"
      );
      const result = await executeJoinQueryForEtlRun(body);
      if (!result.ok) {
        return { ok: false, error: result.error || "JOIN falló" };
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `JOIN interno no disponible en este servicio (${message}). Configurá NEXT_INTERNAL_URL con la URL de la app Next.js (Vercel).`,
      };
    }
  }
}
