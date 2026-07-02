"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionsSelectColumns = connectionsSelectColumns;
exports.connectionsSelectColumnsWithUser = connectionsSelectColumnsWithUser;
const backend_config_1 = require("../api/backend-config");
function connectionsSelectColumns() {
    const legacy = "id, type, config, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
    return (0, backend_config_1.shouldUseOwnBackend)() ? "*" : legacy;
}
function connectionsSelectColumnsWithUser() {
    const legacy = "id, user_id, type, config, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
    return (0, backend_config_1.shouldUseOwnBackend)() ? "*" : legacy;
}
//# sourceMappingURL=connections-query.js.map