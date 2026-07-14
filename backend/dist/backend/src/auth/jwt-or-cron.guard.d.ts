import { CanActivate, ExecutionContext } from "@nestjs/common";
export declare function isValidSchedulerSecret(secret: string): boolean;
declare const JwtOrCronAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class JwtOrCronAuthGuard extends JwtOrCronAuthGuard_base implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export {};
