"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServerAuthUser = getServerAuthUser;
exports.createServerBackendClient = createServerBackendClient;
const headers_1 = require("next/headers");
const jose_1 = require("jose");
const jwt_config_1 = require("../auth/jwt-config");
const service_admin_client_1 = require("./service-admin-client");
async function getServerAuthUser() {
    const token = (await (0, headers_1.cookies)()).get("biconic_access")?.value;
    if (!token)
        return null;
    try {
        const { payload } = await (0, jose_1.jwtVerify)(token, (0, jwt_config_1.getJwtSecretKey)());
        return {
            id: String(payload.sub),
            email: typeof payload.email === "string" ? payload.email : undefined,
            app_role: typeof payload.app_role === "string" ? payload.app_role : undefined,
        };
    }
    catch {
        return null;
    }
}
async function createServerBackendClient() {
    const user = await getServerAuthUser();
    const admin = (0, service_admin_client_1.createServiceAdminClient)();
    return {
        auth: {
            async getUser() {
                if (!user)
                    return { data: { user: null }, error: { message: "No autenticado" } };
                return {
                    data: {
                        user: {
                            id: user.id,
                            email: user.email,
                            user_metadata: { app_role: user.app_role },
                        },
                    },
                    error: null,
                };
            },
            async getSession() {
                const r = await this.getUser();
                return { data: { session: r.data.user ? { user: r.data.user } : null }, error: null };
            },
        },
        from(table) {
            return admin.from(table);
        },
        schema(schemaName) {
            return admin.schema(schemaName);
        },
    };
}
//# sourceMappingURL=server-backend.js.map