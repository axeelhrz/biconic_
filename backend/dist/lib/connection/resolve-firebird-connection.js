"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFirebirdAttachOptions = resolveFirebirdAttachOptions;
exports.formatFirebirdConnectError = formatFirebirdConnectError;
const connection_secret_1 = require("../connection-secret");
const connection_persistence_1 = require("./connection-persistence");
function resolveFirebirdAttachOptions(rawConn) {
    const conn = (0, connection_persistence_1.hydrateConnectionRow)(rawConn);
    const host = String(conn.db_host ?? "").trim();
    const database = String(conn.db_name ?? "").trim();
    const user = String(conn.db_user ?? "").trim();
    const port = conn.db_port != null && Number(conn.db_port) > 0 ? Number(conn.db_port) : 15421;
    if (!host) {
        throw new Error("La conexión Firebird no tiene servidor (host) configurado. Editá la conexión en «Conexiones» y guardá el host remoto; no se intenta conectar a localhost.");
    }
    if (!database || !user) {
        throw new Error("La conexión Firebird está incompleta (falta base de datos o usuario). Revisá la configuración de la conexión.");
    }
    let password = "";
    if (conn.db_password_encrypted) {
        try {
            password = (0, connection_secret_1.decryptConnectionPassword)(conn.db_password_encrypted);
        }
        catch {
        }
    }
    if (!password) {
        password =
            process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "";
    }
    return {
        host,
        port,
        database,
        user,
        password,
        lowercase_keys: false,
    };
}
function formatFirebirdConnectError(err, host) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED.*127\.0\.0\.1/i.test(msg) || /ECONNREFUSED.*localhost/i.test(msg)) {
        return host
            ? `No se pudo conectar a Firebird en ${host}. Si el error menciona 127.0.0.1, la conexión no tiene host guardado correctamente.`
            : "No se pudo conectar a Firebird: el servidor quedó en localhost (127.0.0.1). Revisá que la conexión tenga el host remoto guardado en «Conexiones».";
    }
    if (/ECONNREFUSED/i.test(msg)) {
        return `No se pudo conectar al servidor Firebird${host ? ` (${host})` : ""}. Verificá host, puerto y que el servidor acepte conexiones externas.`;
    }
    return msg;
}
//# sourceMappingURL=resolve-firebird-connection.js.map