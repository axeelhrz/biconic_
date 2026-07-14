import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    private setAuthCookies;
    login(body: {
        email: string;
        password: string;
    }, res: Response): Promise<{
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
    }>;
    register(body: {
        email: string;
        password: string;
        fullName?: string;
    }, res: Response): Promise<{
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
    }>;
    refresh(req: Request, res: Response): Promise<{
        error: string;
        user?: undefined;
    } | {
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
        error?: undefined;
    }>;
    logout(req: Request, res: Response): Promise<{
        ok: boolean;
    }>;
    me(req: Request & {
        user: {
            sub: string;
        };
    }): Promise<{
        id: string;
        email: string | null;
        full_name: string | null;
        avatar_url: string | null;
        app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
    }>;
    migrateUsers(body: {
        secret: string;
        users: Array<{
            id: string;
            email: string;
            full_name?: string;
            app_role?: string;
        }>;
    }): Promise<{
        migrated: number;
    } | {
        error: string;
    }>;
}
