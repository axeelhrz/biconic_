/** Helpers para SELECT Firebird respetando filter.columns del ETL guiado. */

export function firebirdBareColumnNames(columns: string[] | undefined | null): string[] {
  if (!Array.isArray(columns)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of columns) {
    const c = String(raw || "")
      .replace(/^primary\./i, "")
      .replace(/^join_\d+\./i, "")
      .trim();
    if (!c || c === "*") continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function buildFirebirdSelectList(
  columns: string[] | undefined | null,
  safePart: (name: string) => string
): string {
  const bare = firebirdBareColumnNames(columns);
  if (!bare.length) return "*";
  return bare.map((c) => safePart(c)).join(", ");
}

const defaultSaneKey = (key: string) => key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

/** Deja solo las columnas pedidas en cada fila (match case-insensitive / sane key). */
export function projectRowsToConfiguredColumns<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[] | undefined | null,
  toSaneKey: (key: string) => string = defaultSaneKey
): T[] {
  const bare = firebirdBareColumnNames(columns);
  if (!bare.length) return rows;
  const wanted = new Set(bare.map((c) => toSaneKey(c)));
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const sk = toSaneKey(key);
      if (wanted.has(sk)) out[sk] = value;
    }
    for (const col of bare) {
      const sk = toSaneKey(col);
      if (out[sk] !== undefined) continue;
      const matchKey = Object.keys(row).find((k) => toSaneKey(k) === sk);
      if (matchKey !== undefined) out[sk] = row[matchKey];
    }
    return out as T;
  });
}

export function isFirebirdColumnQueryError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /-206/i.test(msg) ||
    /column unknown/i.test(msg) ||
    /unknown column/i.test(msg) ||
    /invalid column name/i.test(msg)
  );
}
