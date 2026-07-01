import { type PostgresServiceQuery } from "./service-admin-client";
export type ServerAuthUser = {
    id: string;
    email?: string;
    app_role?: string;
};
export declare function getServerAuthUser(): Promise<ServerAuthUser | null>;
export declare function createServerBackendClient(): Promise<{
    auth: {
        getUser(): Promise<{
            data: {
                user: null;
            };
            error: {
                message: string;
            };
        } | {
            data: {
                user: {
                    id: string;
                    email: string | undefined;
                    user_metadata: {
                        app_role: string | undefined;
                    };
                };
            };
            error: null;
        }>;
        getSession(): Promise<{
            data: {
                session: {
                    user: {
                        id: string;
                        email: string | undefined;
                        user_metadata: {
                            app_role: string | undefined;
                        };
                    };
                } | null;
            };
            error: null;
        }>;
    };
    from(table: string): PostgresServiceQuery;
    schema(schemaName: string): {
        from: (table: string) => PostgresServiceQuery;
    };
}>;
