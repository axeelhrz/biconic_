import { DatabaseService } from "../database/database.service";
export declare class AdminService {
    private readonly db;
    constructor(db: DatabaseService);
    private assertAdmin;
    listClients(appRole?: string): Promise<import("pg").QueryResultRow[]>;
    createClient(appRole: string | undefined, payload: {
        name: string;
        type?: string;
        adminEmail: string;
        adminPassword: string;
        adminName?: string;
    }): Promise<{
        clientId: string;
        userId: string;
    }>;
    addClientMember(appRole: string | undefined, payload: {
        clientId: string;
        email: string;
        password?: string;
        fullName?: string;
        role?: string;
    }): Promise<{
        userId: string;
    }>;
    listUsers(appRole?: string): Promise<import("pg").QueryResultRow[]>;
    createUser(appRole: string | undefined, payload: {
        email: string;
        password: string;
        fullName?: string;
        appRole?: string;
    }): Promise<{
        userId: string;
    }>;
}
