import { JwtService } from "@nestjs/jwt";
import { DatabaseService } from "../database/database.service";
export declare class AuthService {
    private readonly db;
    private readonly jwt;
    constructor(db: DatabaseService, jwt: JwtService);
    private refreshSecret;
    private signAccessToken;
    private hashRefreshToken;
    private issueRefreshToken;
    login(email: string, password: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
    }>;
    register(email: string, password: string, fullName?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            full_name: string | null;
            avatar_url: string | null;
            app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
        };
    }>;
    logout(refreshToken?: string): Promise<{
        ok: boolean;
    }>;
    me(userId: string): Promise<{
        id: string;
        email: string | null;
        full_name: string | null;
        avatar_url: string | null;
        app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
    }>;
    migrateFromSupabaseExport(users: Array<{
        id: string;
        email: string;
        full_name?: string;
        app_role?: string;
    }>): Promise<{
        migrated: number;
    }>;
    private publicUser;
}
