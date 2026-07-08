import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtOrCronAuthGuard } from "./jwt-or-cron.guard";
import { getAccessTokenExpires } from "@/lib/auth/session-config";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-32chars!!",
      signOptions: {
        expiresIn: getAccessTokenExpires() as `${number}${"s" | "m" | "h" | "d"}`,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtOrCronAuthGuard],
  exports: [AuthService, JwtModule, JwtOrCronAuthGuard, PassportModule],
})
export class AuthModule {}
