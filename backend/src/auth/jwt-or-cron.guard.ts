import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

function resolveCronSecret(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const h = req.headers ?? {};
  const cronRaw = h["x-cron-secret"];
  const cron = Array.isArray(cronRaw) ? cronRaw[0] : cronRaw;
  const authRaw = h.authorization ?? h.Authorization;
  const auth = Array.isArray(authRaw) ? authRaw[0] : authRaw;
  const fromAuth = String(auth ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return String(cron ?? "").trim() || fromAuth;
}

export function isValidSchedulerSecret(secret: string): boolean {
  const expected =
    process.env.ETL_SCHEDULER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  return !!expected && !!secret && secret === expected;
}

/**
 * Autoriza con JWT de usuario (Passport) o con x-cron-secret / Bearer CRON_SECRET
 * para disparos programados desde Vercel Cron / run-scheduled.
 */
@Injectable()
export class JwtOrCronAuthGuard extends AuthGuard("jwt") implements CanActivate {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      cronAuth?: boolean;
    }>();
    const secret = resolveCronSecret(req);
    if (isValidSchedulerSecret(secret)) {
      req.cronAuth = true;
      return true;
    }
    try {
      const ok = await super.canActivate(context);
      return ok as boolean;
    } catch {
      throw new UnauthorizedException("No autorizado");
    }
  }
}
