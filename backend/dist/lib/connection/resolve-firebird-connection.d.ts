export type FirebirdAttachOptions = {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    lowercase_keys: false;
};
export declare function resolveFirebirdAttachOptions(rawConn: Record<string, unknown>): FirebirdAttachOptions;
export declare function formatFirebirdConnectError(err: unknown, host?: string): string;
