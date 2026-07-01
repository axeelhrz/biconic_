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
const fs_1 = require("fs");
const module_1 = require("module");
const path_1 = require("path");
const url_1 = require("url");
function tryRegisterTsx() {
    const g = globalThis;
    if (g.__biconicTsxRegistered)
        return;
    try {
        const req = (0, module_1.createRequire)(__filename);
        req("tsx/cjs/api").register();
        g.__biconicTsxRegistered = true;
    }
    catch {
    }
}
function resolveJoinQueryRouteSpecifier() {
    const roots = new Set([
        process.cwd(),
        (0, path_1.join)(process.cwd(), ".."),
        (0, path_1.join)(process.cwd(), "../.."),
    ]);
    try {
        const req = (0, module_1.createRequire)(__filename);
        roots.add(req.resolve("../../.."));
    }
    catch {
    }
    for (const root of roots) {
        const tsPath = (0, path_1.join)(root, "app/api/connection/join-query/route.ts");
        if ((0, fs_1.existsSync)(tsPath))
            return (0, url_1.pathToFileURL)(tsPath).href;
        const jsPath = (0, path_1.join)(root, "app/api/connection/join-query/route.js");
        if ((0, fs_1.existsSync)(jsPath))
            return jsPath;
    }
    return "@/app/api/connection/join-query/route";
}
async function loadJoinQueryPost() {
    tryRegisterTsx();
    const specifier = resolveJoinQueryRouteSpecifier();
    const errors = [];
    for (const spec of [specifier, "@/app/api/connection/join-query/route"]) {
        try {
            const mod = (await Promise.resolve(`${spec}`).then(s => __importStar(require(s))));
            if (typeof mod.POST === "function")
                return mod.POST;
            errors.push(`${spec}: POST no exportado`);
        }
        catch (e) {
            errors.push(`${spec}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    throw new Error(`No se pudo cargar join-query (${errors.slice(0, 2).join("; ")})`);
}
async function executeJoinQueryForEtlRun(body) {
    const secret = process.env.INTERNAL_ETL_SECRET?.trim() ??
        process.env.CRON_SECRET?.trim() ??
        "";
    const POST = await loadJoinQueryPost();
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