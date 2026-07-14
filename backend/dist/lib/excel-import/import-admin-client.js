"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImportDbUrl = getImportDbUrl;
exports.createImportAdminClient = createImportAdminClient;
exports.closeImportAdminClient = closeImportAdminClient;
const service_admin_client_1 = require("../supabase/service-admin-client");
const excel_upload_storage_1 = require("../storage/excel-upload-storage");
function getImportDbUrl() {
    return (0, service_admin_client_1.getServiceDbUrl)();
}
function createImportAdminClient() {
    const admin = (0, service_admin_client_1.createServiceAdminClient)();
    return {
        from(table) {
            return admin.from(table);
        },
        storage: {
            from(_bucket) {
                return {
                    async createSignedUrl(storagePath) {
                        if (!(0, excel_upload_storage_1.hasLocalExcelFile)(storagePath)) {
                            return {
                                data: null,
                                error: { message: "Archivo no encontrado en almacenamiento local" },
                            };
                        }
                        return {
                            data: { signedUrl: (0, excel_upload_storage_1.getExcelFileServeUrl)(storagePath) },
                            error: null,
                        };
                    },
                };
            },
        },
        _sql: admin._sql,
    };
}
async function closeImportAdminClient(client) {
    if (client._sql) {
        await client._sql.end();
    }
}
//# sourceMappingURL=import-admin-client.js.map