"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
const server_backend_1 = require("./server-backend");
async function createClient() {
    return (0, server_backend_1.createServerBackendClient)();
}
//# sourceMappingURL=server.js.map