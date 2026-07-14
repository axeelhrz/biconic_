"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtOrCronAuthGuard = void 0;
exports.isValidSchedulerSecret = isValidSchedulerSecret;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
function resolveCronSecret(req) {
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
function isValidSchedulerSecret(secret) {
    const expected = process.env.ETL_SCHEDULER_SECRET?.trim() ||
        process.env.CRON_SECRET?.trim() ||
        "";
    return !!expected && !!secret && secret === expected;
}
let JwtOrCronAuthGuard = class JwtOrCronAuthGuard extends (0, passport_1.AuthGuard)("jwt") {
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const secret = resolveCronSecret(req);
        if (isValidSchedulerSecret(secret)) {
            req.cronAuth = true;
            return true;
        }
        try {
            const ok = await super.canActivate(context);
            return ok;
        }
        catch {
            throw new common_1.UnauthorizedException("No autorizado");
        }
    }
};
exports.JwtOrCronAuthGuard = JwtOrCronAuthGuard;
exports.JwtOrCronAuthGuard = JwtOrCronAuthGuard = __decorate([
    (0, common_1.Injectable)()
], JwtOrCronAuthGuard);
//# sourceMappingURL=jwt-or-cron.guard.js.map