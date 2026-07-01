"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionsSelectColumns = connectionsSelectColumns;
exports.connectionsSelectColumnsWithUser = connectionsSelectColumnsWithUser;
const backend_config_1 = require("../api/backend-config");
function connectionsSelectColumns() {
    return (0, backend_config_1.shouldUseOwnBackend)()
        ? "*"
        : "id, type, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
}
function connectionsSelectColumnsWithUser() {
    return (0, backend_config_1.shouldUseOwnBackend)()
        ? "*"
        : "id, user_id, type, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
}
//# sourceMappingURL=connections-query.js.map