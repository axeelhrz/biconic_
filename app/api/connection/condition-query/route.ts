import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";

type FilterCondition = {
  column: string;
  operator:
    | "="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "contains"
    | "startsWith"
    | "endsWith"
    | "in"
    | "not in"
    | "is null"
    | "is not null";
  value?: string;
};

type ArithmeticOperation = {
  id: string;
  leftOperand: { type: "column" | "constant"; value: string };
  operator: "+" | "-" | "*" | "/" | "%" | "^";
  rightOperand: { type: "column" | "constant"; value: string };
  resultColumn: string;
};

type CastConversion = {
  column: string;
  targetType:
    | "string"
    | "number"
    | "integer"
    | "decimal"
    | "boolean"
    | "date"
    | "datetime";
};

type ConditionRule = {
  id: string;
  leftOperand: { type: "column" | "constant"; value: string };
  comparator: "=" | "!=" | ">" | ">=" | "<" | "<=";
  rightOperand: { type: "column" | "constant"; value: string };
  resultColumn: string;
  outputType: "boolean" | "string" | "number";
  thenValue?: string;
  elseValue?: string;
  shouldFilter?: boolean;
};

type ConditionQueryBody = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  table: string; // schema.table
  columns?: string[]; // selected columns; default *
  conditions?: FilterCondition[];
  operations?: ArithmeticOperation[];
  conversions?: CastConversion[];
  rules: ConditionRule[];
  limit?: number;
  offset?: number;
  count?: boolean;
};

function buildCastWrapper(
  dbType: "postgres" | "mysql",
  column: string,
  targetType: CastConversion["targetType"]
): string {
  const pgIdent = `"${column.replace(/"/g, '""')}"`;
  const myIdent = `\`${column.replace(/`/g, "``")}\``;
  if (dbType === "postgres") {
    const ident = pgIdent;
    // We strictly use inline expressions to avoid correlated CTE issues in sub-selects
    const r = `regexp_replace(COALESCE(${ident}::text,''), '\\s+', '', 'g')`;
    const dotCount = `(length(${r}) - length(replace(${r}, '.', '')))`;
    const commaCount = `(length(${r}) - length(replace(${r}, ',', '')))`;
    const firstDot = `position('.' in ${r})`;
    const firstComma = `position(',' in ${r})`;
    
    const sanitizedNumeric = `NULLIF(regexp_replace(CASE 
      WHEN ${commaCount} = 0 AND ${dotCount} > 1 THEN replace(${r}, '.', '') 
      WHEN ${dotCount} = 0 AND ${commaCount} > 1 THEN replace(${r}, ',', '') 
      WHEN ${commaCount} > 0 AND ${dotCount} > 0 THEN (
        CASE WHEN ${firstComma} > ${firstDot} 
             THEN replace(replace(${r}, '.', ''), ',', '.') 
             ELSE replace(replace(${r}, ',', ''), '.', '.') 
        END
      ) 
      WHEN ${commaCount} = 1 AND ${dotCount} = 0 THEN replace(${r}, ',', '.') 
      WHEN ${dotCount} = 1 AND ${commaCount} = 0 THEN ${r} 
      ELSE ${r} 
    END, '[^0-9.\-]', '', 'g'), '')`;

    switch (targetType) {
      case "string":
        return `CAST(${ident} AS text)`;
      case "integer":
        return `CAST(${sanitizedNumeric} AS numeric)::bigint`;
      case "number":
      case "decimal":
        return `CAST(${sanitizedNumeric} AS numeric)`;
      case "boolean":
        return `CASE
          WHEN trim(lower(COALESCE(${ident}::text, ''))) IN ('true','t','1','yes','y','si','sí') THEN true
          WHEN trim(lower(COALESCE(${ident}::text, ''))) IN ('false','f','0','no','n') THEN false
          ELSE NULL
        END`;
      case "date":
        return `CAST(${ident} AS date)`;
      case "datetime":
        return `CAST(${ident} AS timestamp)`;
      default:
        return ident;
    }
  } else {
    const ident = myIdent;
    const baseNoSpace = `REPLACE(COALESCE(${ident}, ''), ' ', '')`;
    const normalizeComma = `CASE
      WHEN INSTR(${baseNoSpace}, ',') > 0 AND INSTR(${baseNoSpace}, '.') > 0 THEN REPLACE(${baseNoSpace}, ',', '')
      WHEN INSTR(${baseNoSpace}, ',') > 0 AND INSTR(${baseNoSpace}, '.') = 0 THEN REPLACE(${baseNoSpace}, ',', '.')
      ELSE ${baseNoSpace}
    END`;
    const cleanedSymbols = `REPLACE(REPLACE(${normalizeComma}, '$', ''), '%', '')`;
    switch (targetType) {
      case "string":
        return `CAST(${ident} AS CHAR)`;
      case "integer":
        return `CAST(NULLIF(${cleanedSymbols}, '') AS SIGNED)`;
      case "number":
      case "decimal":
        return `CAST(NULLIF(${cleanedSymbols}, '') AS DECIMAL(38,10))`;
      case "boolean":
        return `CASE
          WHEN LOWER(TRIM(COALESCE(${ident}, ''))) IN ('true','t','1','yes','y','si','sí') THEN 1
          WHEN LOWER(TRIM(COALESCE(${ident}, ''))) IN ('false','f','0','no','n') THEN 0
          ELSE NULL
        END`;
      case "date":
        return `CAST(${ident} AS DATE)`;
      case "datetime":
        return `CAST(${ident} AS DATETIME)`;
      default:
        return ident;
    }
  }
}

function buildArithmeticExpression(
  op: ArithmeticOperation,
  dbType: "postgres" | "mysql",
  conversions: CastConversion[] | undefined
): string {
  const convMap = new Map<string, CastConversion>();
  (conversions || []).forEach((c) => convMap.set(c.column, c));
  const getOperandValue = (operand: {
    type: "column" | "constant";
    value: string;
  }): string => {
    if (operand.type === "constant") {
      return operand.value;
    } else {
      const conv = convMap.get(operand.value);
      if (conv) return buildCastWrapper(dbType, operand.value, conv.targetType);
      return dbType === "postgres"
        ? `"${operand.value.replace(/"/g, '""')}"`
        : `\`${operand.value.replace(/`/g, "``")}\``;
    }
  };

  const left = getOperandValue(op.leftOperand);
  const right = getOperandValue(op.rightOperand);

  if (op.operator === "^") {
    return dbType === "postgres"
      ? `POWER(${left}, ${right})`
      : `POW(${left}, ${right})`;
  }
  return `(${left} ${op.operator} ${right})`;
}

async function getPasswordFromSecret(
  secretId: string | null
): Promise<string | null> {
  if (!secretId) return null;
  // Placeholder implementation matching join-query
  return process.env.DB_PASSWORD_PLACEHOLDER || "tu-contraseña-secreta";
}

function buildWhereClausePg(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = `"${c.column.replace(/"/g, '""')}"`;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} ILIKE $${params.length}`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} IN (${idxs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} NOT IN (${idxs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildWhereClauseMy(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = `\`${c.column.replace(/`/g, "``")}\``;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildFilterPartPg(rule: ConditionRule): string | null {
  if (!rule.shouldFilter) return null;
  const col = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const literal = (v: string) => {
    const t = (v ?? "").trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return t; 
    if (/^(true|false)$/i.test(t)) return t.toLowerCase();
    return `'${t.replace(/'/g, "''")}'`;
  };
  const left =
    rule.leftOperand.type === "column"
      ? col(rule.leftOperand.value)
      : literal(rule.leftOperand.value);
  const right =
    rule.rightOperand.type === "column"
      ? col(rule.rightOperand.value)
      : literal(rule.rightOperand.value);
  return `${left} ${rule.comparator} ${right}`;
}

function buildConditionExprPg(rule: ConditionRule) {
  const col = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const literal = (v: string) => {
    const t = (v ?? "").trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return t; 
    if (/^(true|false)$/i.test(t)) return t.toLowerCase();
    return `'${t.replace(/'/g, "''")}'`;
  };
  // In subquery mode, columns are pre-calculated, so we can trust their names directly
  const left =
    rule.leftOperand.type === "column"
      ? col(rule.leftOperand.value)
      : literal(rule.leftOperand.value);
  const right =
    rule.rightOperand.type === "column"
      ? col(rule.rightOperand.value)
      : literal(rule.rightOperand.value);
  const cmp = `${left} ${rule.comparator} ${right}`;
  const alias = `"${rule.resultColumn.replace(/"/g, '""')}"`;
  if (rule.outputType === "boolean") {
    return `CASE WHEN ${cmp} THEN TRUE ELSE FALSE END AS ${alias}`;
  } else if (rule.outputType === "number") {
    const t = (rule.thenValue ?? "1").trim();
    const f = (rule.elseValue ?? "0").trim();
    const norm = (x: string) => (x && /^-?\d+(?:\.\d+)?$/.test(x) ? x : "0");
    return `CASE WHEN ${cmp} THEN ${norm(t)} ELSE ${norm(f)} END AS ${alias}`;
  } else {
    const t = (rule.thenValue ?? "true").replace(/'/g, "''");
    const f = (rule.elseValue ?? "false").replace(/'/g, "''");
    return `CASE WHEN ${cmp} THEN '${t}' ELSE '${f}' END AS ${alias}`;
  }
}

function buildFilterPartMy(rule: ConditionRule): string | null {
  if (!rule.shouldFilter) return null;
  const col = (v: string) => `\`${v.replace(/`/g, "``")}\``;
  const literal = (v: string) => {
    const t = (v ?? "").trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return t;
    if (/^(true|false)$/i.test(t)) return t.toLowerCase();
    return `'${t.replace(/'/g, "''")}'`;
  };
  const left =
    rule.leftOperand.type === "column"
      ? col(rule.leftOperand.value)
      : literal(rule.leftOperand.value);
  const right =
    rule.rightOperand.type === "column"
      ? col(rule.rightOperand.value)
      : literal(rule.rightOperand.value);
  return `${left} ${rule.comparator} ${right}`;
}

function buildConditionExprMy(rule: ConditionRule) {
  const col = (v: string) => `\`${v.replace(/`/g, "``")}\``;
  const literal = (v: string) => {
    const t = (v ?? "").trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return t;
    if (/^(true|false)$/i.test(t)) return t.toLowerCase();
    return `'${t.replace(/'/g, "''")}'`;
  };
  const left =
    rule.leftOperand.type === "column"
      ? col(rule.leftOperand.value)
      : literal(rule.leftOperand.value);
  const right =
    rule.rightOperand.type === "column"
      ? col(rule.rightOperand.value)
      : literal(rule.rightOperand.value);
  const cmp = `${left} ${rule.comparator} ${right}`;
  const alias = `\`${rule.resultColumn.replace(/`/g, "``")}\``;
  if (rule.outputType === "boolean") {
    return `CASE WHEN ${cmp} THEN TRUE ELSE FALSE END AS ${alias}`;
  } else if (rule.outputType === "number") {
    const t = (rule.thenValue ?? "1").trim();
    const f = (rule.elseValue ?? "0").trim();
    const norm = (x: string) => (x && /^-?\d+(?:\.\d+)?$/.test(x) ? x : "0");
    return `CASE WHEN ${cmp} THEN ${norm(t)} ELSE ${norm(f)} END AS ${alias}`;
  } else {
    const t = (rule.thenValue ?? "true").replace(/'/g, "''");
    const f = (rule.elseValue ?? "false").replace(/'/g, "''");
    return `CASE WHEN ${cmp} THEN '${t}' ELSE '${f}' END AS ${alias}`;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as ConditionQueryBody | null;
    if (!body)
      return NextResponse.json(
        { ok: false, error: "Cuerpo vacío" },
        { status: 400 }
      );

    let {
      connectionId,
      type,
      host,
      database,
      user,
      password,
      port,
      ssl,
      table,
      columns,
      conditions,
      operations,
      conversions,
      rules,
      limit,
      offset,
      count,
    } = body;

    if (!table)
      return NextResponse.json(
        { ok: false, error: "Tabla requerida" },
        { status: 400 }
      );
    
    console.log("ConditionQuery received:", { 
       table, 
       opCount: operations?.length, 
       convCount: conversions?.length,
       ruleCount: rules?.length,
       ops: operations ? JSON.stringify(operations) : "[]",
       rules: rules ? JSON.stringify(rules) : "[]"
    });

    if (!rules || rules.length === 0)
      return NextResponse.json(
        { ok: false, error: "Se requiere al menos una regla" },
        { status: 400 }
      );
    if (!limit || limit < 1 || limit > 1000) limit = 50;
    if (!offset || offset < 0) offset = 0;

    // Auth
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser)
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );

    if (connectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select("id, user_id, type, db_host, db_name, db_user, db_port, db_password_secret_id")
        .eq("id", String(connectionId))
        .maybeSingle();   
      if (connError || !conn)
        return NextResponse.json(
          { ok: false, error: connError?.message || "Conexión no encontrada" },
          { status: 404 }
        );
      host = (conn as any)?.db_host ?? host;
      database = (conn as any)?.db_name ?? database;
      user = (conn as any)?.db_user ?? user;
      port = (conn as any)?.db_port ?? port;

      // Use connection type if not provided in body
      if (!type && (conn as any)?.type) {
        type = (conn as any).type;
      }

      // Try to resolve password from secret if not provided
      if (!password && (conn as any)?.db_password_secret_id) {
        const resolved = await getPasswordFromSecret((conn as any).db_password_secret_id);
        if (resolved) password = resolved;
      }

      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      ) {
        type = "excel" as any;
      }
      console.log("Connection resolved:", { 
          id: connectionId, 
          typeInDb: (conn as any)?.type, 
          finalType: type,
          hasPassword: !!password,
          hasSecret: !!(conn as any)?.db_password_secret_id
      });
    }

    if (type === ("excel" as any)) {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_table_name")
        .eq("connection_id", String(connectionId))
        .single();
      if (metaError || !meta) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }
      const tableNamePhysical =
        (meta as any).physical_table_name ||
        `import_${String(connectionId).replaceAll("-", "_")}`;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "Configuración de base de datos interna no disponible",
          },
          { status: 500 }
        );
      }
      const client = new PgClient({ connectionString: dbUrl } as any);
      await client.connect();
      console.log("Connected to Internal DB for Excel");

      const fullTable = `"data_warehouse"."${tableNamePhysical.replace(/"/g,'""')}"`;
      
      const convMap = new Map<string, CastConversion>();
      (conversions || []).forEach((c) => convMap.set(c.column, c));

      // Base Query (Inner most)
      const originalCols = columns?.length 
        ? columns.map(c => {
             const conv = convMap.get(c);
             if (conv) {
                return `${buildCastWrapper("postgres", c, conv.targetType)} AS "${c.replace(/"/g, '""')}"`;
             }
             return `"${c.replace(/"/g, '""')}"`;
          }) 
        : ["*"];
      const { clause, params } = buildWhereClausePg(conditions || []);

      let currentSql = `SELECT ${originalCols.join(", ")} FROM ${fullTable} ${clause}`;
      let currentParams = [...params];

      // Apply rules sequentially (chaining)
      if (rules && rules.length > 0) {
        for (const rule of rules) {
           const condExpr = buildConditionExprPg(rule);
           const filterPart = buildFilterPartPg(rule);
           const where = filterPart ? `WHERE ${filterPart}` : "";
           // Wrap previous query
           // Note: We need to ensure aliases don't collide or are handled. 
           // sub.* includes everything from previous steps.
           currentSql = `SELECT sub.*, ${condExpr} FROM (${currentSql}) AS sub ${where}`;
        }
      }

      // If we have arithmetic operations (Excel branch logic was mixed here in previous code? 
      // The previous code had a separate block for "operations". 
      // If this endpoint is strictly condition-query, operations shouldn't be here? 
      // Checking types: ConditionQueryBody DOES include 'operations'? 
      // No, ConditionQueryBody usually just has rules. 
      // Let's check the type definition at top of file.)
      
      // Checking type definition in file content:
      // type ConditionQueryBody = { ... operations?: ArithmeticOperation[] ... }
      // It seems it DOES support operations (maybe for mixed nodes?). 
      // The frontend ConditionPreviewButton sends operations: arithmeticNode?.arithmetic?.operations
      
      if (operations && operations.length > 0) {
         const arithCols = operations.map((op) => {
           const expr = buildArithmeticExpression(op, "postgres", conversions);
           const alias = `"${op.resultColumn.replace(/"/g, '""')}"`;
           return `${expr} AS ${alias}`;
         });
         // Arithmetic is applied AFTER all conditions? Or do we need to respect order?
         // Frontend collects arithmeticNode separate from Condition nodes.
         // Usually specific Node is Condition OR Arithmetic.
         // If we are previewing a Condition Node, 'operations' comes from upstream Arithmetic?
         // Verify: ConditionPreviewButton logic:
         // `operations: arithmeticNode?.arithmetic?.operations || []` (Upstream)
         // So Arithmetic is UPSTREAM of Condition?
         // Wait. ConditionPreview loop finds "arithmeticNode".
         // Use case: Arithmetic -> Condition.
         // In that case, Arithmetic operations should run BEFORE Condition rules?
         // If `rules` array includes upstream conditions, where do upstream arithmetic operations go?
         // The current frontend implementation passes `operations` as a separate array.
         // It does NOT interleave them with `rules`.
         
         // If logic is Arithmetic -> Condition, then Arithmetic columns should be available to Condition.
         // So Arithmetic should apply to Base Query, OR act as the Base Query for Conditions.
         // But `rules` might include upstream rules that came BEFORE Arithmetic logic?
         // This is getting complex.
         // Assuming for now Arithmetic is applied at the END or BEGINNING. 
         // If usage is C1 -> A -> C2.
         // C2 Context: collectedRules = [C1]. operations = [A].
         // If A depends on C1? Then C1 must run first.
         // If C2 depends on A? Then A must run first.
         // Correct order: C1 -> A -> C2.
         // But we receive rules=[C1, C2] and operations=[A].
         // We lost the global ordering.
         
         // User specific request: "concateno condition con condition".
         // C1 -> C2.
         // So operations is likely empty or we can apply them before/after.
         // Standard ETL: Filter -> Cast -> ... -> Condition.
         // If we assume a linear chain structure passed differently, we'd need a different API.
         // For now, let's assume Operations apply to the Base, then Rules apply on top?
         // Or Rules apply on Base, then Operations?
         
         // In ConditionPreviewButton, it collects ONE arithmetic node.
         // `arithmeticNode` is found by walking back.
         // If we have A -> C1 -> C2.
         // Walk back from C2. Found C1. Found A.
         // arithmeticNode = A. collectedRules = [C1].
         // Real order A -> C1 -> C2.
         // So Operations should be applied early.
         
         // Let's apply Operations FIRST, then Rules.
         // Modify the base query builder:
         
         // RE-WRITE base query with operations
         currentSql = `SELECT ${originalCols.join(", ")} FROM ${fullTable} ${clause}`;
         
         if (operations.length > 0) {
             const arithCols = operations.map((op) => {
               const expr = buildArithmeticExpression(op, "postgres", conversions); 
               // Note: conversions passed to arithmetic helper. verify helper uses them on base cols.
               const alias = `"${op.resultColumn.replace(/"/g, '""')}"`;
               return `${expr} AS ${alias}`;
             });
             currentSql = `SELECT sub.*, ${arithCols.join(", ")} FROM (${currentSql}) AS sub`;
         }
         
         // THEN apply rules
         if (rules && rules.length > 0) {
           for (const rule of rules) {
             const condExpr = buildConditionExprPg(rule);
             const filterPart = buildFilterPartPg(rule);
             const where = filterPart ? `WHERE ${filterPart}` : "";
             currentSql = `SELECT sub.*, ${condExpr} FROM (${currentSql}) AS sub ${where}`;
           }
         }
      } else {
         // No operations, just rules
         if (rules && rules.length > 0) {
            for (const rule of rules) {
              const condExpr = buildConditionExprPg(rule);
              const filterPart = buildFilterPartPg(rule);
              const where = filterPart ? `WHERE ${filterPart}` : "";
              currentSql = `SELECT sub.*, ${condExpr} FROM (${currentSql}) AS sub ${where}`;
            }
         }
      }

      const sql = `${currentSql} LIMIT $${currentParams.length + 1} OFFSET $${currentParams.length + 2}`;
      const countSql = `SELECT COUNT(*)::int as c FROM (${currentSql}) AS sub`;
      
      console.log("Excel Query SQL (Chained):", sql);

      let resDb;
      try {
        resDb = await client.query(sql, [...currentParams, limit, offset]);
      } catch (err: any) {
         console.error("Excel Query Error:", err);
         throw new Error(`Error Excel DB: ${err.message}`);
      }
      
      let totalOut: number | undefined = undefined;
      if (count) {
          // ... count execution ...
          try {
             const cntRes = await client.query(countSql, currentParams);
             totalOut = cntRes.rows?.[0]?.c ?? undefined;
          } catch(e) {}
      }
      
      await client.end();
      return NextResponse.json({ ok: true, rows: resDb.rows, total: totalOut });
    }

    if (!host || !user)
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );

    const [schema, tableName] = table.includes(".")
      ? table.split(".", 2)
      : ["public", table];

    if (!type) {
      const p = port ? Number(port) : undefined;
      if (p === 5432 || p === 5433) type = "postgres";
      else if (p === 3306 || p === 3307) type = "mysql";
      else type = "postgres";
    }
    
    // Normalize type
    if (type) type = type.toLowerCase() as any;

    if (type === "postgres" || type === "postgresql") {
      if (!password) {
        console.error("Missing password for Postgres");
        return NextResponse.json({ ok: false, error: "Se requiere contraseña" }, { status: 400 });
      }
      console.log("Connecting to Postgres...");
      const client = new PgClient({
        host, user, database, port: port ? Number(port) : 5432,
        password, connectionTimeoutMillis: 8000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      } as any);
      await client.connect();
      console.log("Connected to Postgres");

      const fullTable = `"${schema.replace(/"/g, '""')}"."${tableName.replace(/"/g, '""')}"`;
      
      const convMap = new Map<string, CastConversion>();
      (conversions || []).forEach((c) => convMap.set(c.column, c));

      const originalCols = columns && columns.length
          ? columns.map((c) => {
             const conv = convMap.get(c);
             if (conv) {
                return `${buildCastWrapper("postgres", c, conv.targetType)} AS "${c.replace(/"/g, '""')}"`;
             }
             return `"${c.replace(/"/g, '""')}"`;
          })
          : ["*"];
      
      const { clause, params } = buildWhereClausePg(conditions || []);

      if (operations && operations.length > 0) {
        console.log("Building arithmetic expressions...");
        let arithCols: string[] = [];
        try {
          arithCols = operations.map((op) => {
            console.log("Building op:", op.id);
            const expr = buildArithmeticExpression(op, "postgres", conversions);
            const alias = `"${op.resultColumn.replace(/"/g, '""')}"`;
            return `${expr} AS ${alias}`;
          });
        } catch (e: any) {
           console.error("Error building arithmetic expression:", e);
           throw e;
        }
        console.log("Arithmetic expressions built.");
        
        const subqueryCols = [...originalCols, ...arithCols].join(", ");
        const subQuery = `SELECT ${subqueryCols} FROM ${fullTable} ${clause}`;
        
        const conditionCols = rules.map(r => buildConditionExprPg(r));
        const outerCols = ["sub.*", ...conditionCols].join(", ");

        const filterParts = rules.map(buildFilterPartPg).filter(Boolean);
        const filterClause = filterParts.length > 0 ? `WHERE (${filterParts.join(" OR ")})` : "";
        
        const sql = `SELECT ${outerCols} FROM (${subQuery}) AS sub ${filterClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        
        console.log("--- DEBUG SQL CONSTRUCTION ---");
        console.log("Full Table:", fullTable);
        console.log("Arith Cols:", arithCols);
        console.log("Subquery Cols:", subqueryCols);
        console.log("SubQuery:", subQuery);
        console.log("Condition Cols:", conditionCols);
        console.log("Outer Cols:", outerCols);
        console.log("FINAL SQL (PG):", sql); 
        console.log("------------------------------");

        let res;
        try {
          res = await client.query(sql, [...params, limit, offset]);
        } catch (queryErr: any) {
          console.error("Query Execution Error:", queryErr);
          throw new Error(`Error DB: ${queryErr.message} | SQL: ${sql}`);
        }

        let total: number | undefined = undefined;
        if (count) {
          const countSql = `SELECT COUNT(*)::int as c FROM (${subQuery}) AS sub ${filterClause}`;
          console.log("ConditionQuery Count SQL (PG):", countSql);
          try {
            const cntRes = await client.query(countSql, params);
            total = cntRes.rows?.[0]?.c ?? undefined;
          } catch (countErr: any) {
             console.error("Count Query Error:", countErr);
             throw new Error(`Error Count DB: ${countErr.message} | SQL: ${countSql}`);
          }
        }
        await client.end();
        return NextResponse.json({ ok: true, rows: res.rows, total });
      } else {
        const conditionCols = rules.map((r) => buildConditionExprPg(r));
        const allCols = [...originalCols, ...conditionCols].join(", ");

        const filterParts = rules.map(buildFilterPartPg).filter(Boolean);
        const filterClause = filterParts.length > 0 ? `(${filterParts.join(" OR ")})` : "";
        
        const effectiveClause = clause
          ? `${clause} ${filterClause ? `AND ${filterClause}` : ""}`
          : filterClause ? `WHERE ${filterClause}` : "";

        const sql = `SELECT ${allCols} FROM ${fullTable} ${effectiveClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        
        console.log("ConditionQuery SQL (PG Legacy):", sql);
        const res = await client.query(sql, [...params, limit, offset]);
        
        let total: number | undefined = undefined;
        if (count) {
          const cntRes = await client.query(
            `SELECT COUNT(*)::int as c FROM ${fullTable} ${effectiveClause}`,
            params
          );
          total = cntRes.rows?.[0]?.c ?? undefined;
        }
        await client.end();
        return NextResponse.json({ ok: true, rows: res.rows, total });
      }
    }

    if (type === "mysql") {
       if (!password) return NextResponse.json({ ok: false, error: "Se requiere contraseña" }, { status: 400 });
       const connection = await mysql.createConnection({
        host, user, database, password, port: port ? Number(port) : 3306, connectTimeout: 8000
       });
       
       const fullTable = `\`${schema.replace(/`/g, "``")}\`.\`${tableName.replace(/`/g, "``")}\``;
       
       const convMap = new Map<string, CastConversion>();
       (conversions || []).forEach((c) => convMap.set(c.column, c));

       const originalCols = columns && columns.length
          ? columns.map((c) => {
             const conv = convMap.get(c);
             if (conv) {
                return `${buildCastWrapper("mysql", c, conv.targetType)} AS \`${c.replace(/`/g, "``")}\``;
             }
             return `\`${c.replace(/`/g, "``")}\``;
          })
          : ["*"];
       const { clause, params } = buildWhereClauseMy(conditions || []);

       let currentSql = `SELECT ${originalCols.join(", ")} FROM ${fullTable} ${clause}`;
       let currentParams = [...params];

       if (operations && operations.length > 0) {
          const arithCols = operations.map((op) => {
            const expr = buildArithmeticExpression(op, "mysql", conversions);
            const alias = `\`${op.resultColumn.replace(/`/g, "``")}\``;
            return `${expr} AS ${alias}`;
          });
          currentSql = `SELECT sub.*, ${arithCols.join(", ")} FROM (${currentSql}) AS sub`;
       }

       if (rules && rules.length > 0) {
           for (const rule of rules) {
             const condExpr = buildConditionExprMy(rule);
             const filterPart = buildFilterPartMy(rule);
             const where = filterPart ? `WHERE ${filterPart}` : "";
             currentSql = `SELECT sub.*, ${condExpr} FROM (${currentSql}) AS sub ${where}`;
           }
       }
       
       const sql = `SELECT ${currentSql} LIMIT ? OFFSET ?`;
       // Note: In MySQL `SELECT SELECT ...` is invalid. 
       // Wait, `currentSql` is a SELECT statement. 
       // `SELECT * FROM (SELECT ...) AS sub ...` is correct.
       // My logic above: `currentSql = "SELECT sub.* ... FROM (" + old + ") AS sub"`
       // So `currentSql` IS a valid query.
       // The final wrapper puts LIMIT.
       // `SELECT * FROM (${currentSql}) AS sub LIMIT ...` 
       // Note: subquery aliases must be unique if nested deep? 
       // "AS sub" for every layer. 
       // `SELECT sub.* FROM (SELECT sub.* FROM ...) AS sub`.
       // MySQL allows this if outer alias shadows inner. 
       // Postgres definitely allows. 
       // Let's ensure correct wrapping.
       
       const finalSql = `SELECT * FROM (${currentSql}) AS final LIMIT ? OFFSET ?`;
       const countSql = `SELECT COUNT(*) as c FROM (${currentSql}) AS final`;

       console.log("MySQL Query SQL (Chained):", finalSql);
       
       const [rows] = await connection.execute(finalSql, [...currentParams, limit, offset]);
       
       let total: number | undefined = undefined;
       if (count) {
           const [cnt] = await connection.execute(countSql, currentParams);
           total = Array.isArray(cnt) ? (cnt as any)[0]?.c : undefined;
       }
       await connection.end();
       return NextResponse.json({ ok: true, rows, total });
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de base de datos no soportado" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Error ejecutando consulta de condiciones",
      },
      { status: 500 }
    );
  }
}
