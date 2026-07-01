"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET_FALLBACK = void 0;
exports.getJwtSecretKey = getJwtSecretKey;
exports.JWT_SECRET_FALLBACK = "dev-jwt-secret-change-me-32chars!!";
function getJwtSecretKey() {
    return new TextEncoder().encode(process.env.JWT_SECRET ?? exports.JWT_SECRET_FALLBACK);
}
//# sourceMappingURL=jwt-config.js.map