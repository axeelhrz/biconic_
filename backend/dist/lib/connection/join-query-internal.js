"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeJoinQueryForEtlRun = executeJoinQueryForEtlRun;
async function executeJoinQueryForEtlRun(body) {
    const secret = process.env.INTERNAL_ETL_SECRET?.trim() ??
        process.env.CRON_SECRET?.trim() ??
        "";
    const { POST } = await Promise.resolve().then(() => __importStar(require("@/app/api/connection/join-query/route")));
    const req = {
        json: async () => ({ ...body, fromEtlRun: true }),
        headers: new Headers({
            "Content-Type": "application/json",
            ...(secret ? { "x-internal-etl": secret } : {}),
        }),
    };
    const res = await POST(req);
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    }
    catch {
        return {
            ok: false,
            error: (text || "").slice(0, 300) || `estado ${res.status}`,
        };
    }
    if (!res.ok || !data.ok) {
        return {
            ok: false,
            error: String(data.error || `estado ${res.status}`),
        };
    }
    return {
        ok: true,
        rows: data.rows,
        sourceExhausted: data.sourceExhausted,
        nextSourceOffset: data.nextSourceOffset,
        materialized: data.materialized,
    };
}
//# sourceMappingURL=join-query-internal.js.map