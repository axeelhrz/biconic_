import type { Request } from "express";
import { AdminService } from "./admin.service";
export declare class AdminController {
    private readonly admin;
    constructor(admin: AdminService);
    listClients(req: Request & {
        user: {
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow[]>;
    createClient(body: {
        name: string;
        type?: string;
        adminEmail: string;
        adminPassword: string;
        adminName?: string;
    }, req: Request & {
        user: {
            app_role?: string;
        };
    }): Promise<{
        clientId: string;
        userId: string;
    }>;
    addMember(body: {
        clientId: string;
        email: string;
        password?: string;
        fullName?: string;
        role?: string;
    }, req: Request & {
        user: {
            app_role?: string;
        };
    }): Promise<{
        userId: string;
    }>;
    createUser(body: {
        email: string;
        password: string;
        fullName?: string;
        appRole?: string;
    }, req: Request & {
        user: {
            app_role?: string;
        };
    }): Promise<{
        userId: string;
    }>;
    listUsers(req: Request & {
        user: {
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow[]>;
}
