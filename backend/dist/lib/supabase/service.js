"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceRoleClient = void 0;
const service_admin_client_1 = require("./service-admin-client");
const createServiceRoleClient = () => (0, service_admin_client_1.createServiceRoleOrAdminClient)();
exports.createServiceRoleClient = createServiceRoleClient;
//# sourceMappingURL=service.js.map