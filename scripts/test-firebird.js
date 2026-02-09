/**
 * Prueba de conexión Firebird desde línea de comandos.
 * Uso (sin guardar contraseña en el historial):
 *   FIREBIRD_HOST=34.60.4.133 FIREBIRD_PORT=3050 FIREBIRD_DATABASE="/var/lib/firebird/data/VENTAS.FDB" FIREBIRD_USER=SYSDBA FIREBIRD_PASSWORD='TuContraseña' node scripts/test-firebird.js
 */

const Firebird = require("node-firebird");

const opts = {
  host: process.env.FIREBIRD_HOST || "34.60.4.133",
  port: parseInt(process.env.FIREBIRD_PORT || "3050", 10),
  database: process.env.FIREBIRD_DATABASE || "/var/lib/firebird/data/VENTAS.FDB",
  user: process.env.FIREBIRD_USER || "SYSDBA",
  password: process.env.FIREBIRD_PASSWORD || "",
  lowercase_keys: false,
};

if (!opts.password) {
  console.error("Definí FIREBIRD_PASSWORD en el entorno. Ejemplo:");
  console.error('  FIREBIRD_PASSWORD=\'Tenasa90!\' node scripts/test-firebird.js');
  process.exit(1);
}

console.log("Conectando a", opts.host + ":" + opts.port, "base:", opts.database, "usuario:", opts.user);

Firebird.attach(opts, (err, db) => {
  if (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
  db.query("SELECT 1 AS OK FROM RDB$DATABASE", (qerr, rows) => {
    if (qerr) {
      console.error("Error en consulta:", qerr.message);
      db.detach(() => {});
      process.exit(1);
    }
    console.log("Conexión OK. RDB$DATABASE:", rows);
    db.detach(() => {
      console.log("Desconectado.");
      process.exit(0);
    });
  });
});
