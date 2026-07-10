/** Normaliza join + filter para ejecución programada / background. */

function readTableFromFilter(filter: unknown): string {
  if (!filter || typeof filter !== "object") return "";
  return String((filter as Record<string, unknown>).table ?? "").trim();
}

export type SanitizedJoinResult =
  | { ok: true; join: Record<string, unknown> }
  | { ok: false; error: string };

export function sanitizeGuidedJoinForRun(
  join: unknown,
  filter?: unknown
): SanitizedJoinResult | null {
  if (!join || typeof join !== "object") return null;

  const joinObj = join as Record<string, unknown>;
  const filterTable = readTableFromFilter(filter);
  const isStar =
    joinObj.primaryConnectionId != null &&
    String(joinObj.primaryConnectionId).trim() !== "" &&
    Array.isArray(joinObj.joins);

  if (isStar) {
    const validJoins = (joinObj.joins as Record<string, unknown>[]).filter(
      (jn) =>
        !!jn &&
        typeof jn === "object" &&
        jn.secondaryConnectionId != null &&
        String(jn.secondaryConnectionId).trim() !== "" &&
        String(jn.secondaryTable ?? "").trim() !== ""
    );
    if (validJoins.length === 0) {
      return {
        ok: false,
        error:
          "JOIN estrella inválido: faltan tablas secundarias o conexiones. Editá el ETL y volvé a guardarlo.",
      };
    }
    const primaryTable = String(joinObj.primaryTable ?? "").trim() || filterTable;
    if (!primaryTable) {
      return {
        ok: false,
        error:
          "JOIN estrella inválido: falta tabla principal (primaryTable). Editá el ETL y volvé a guardarlo.",
      };
    }
    return {
      ok: true,
      join: { ...joinObj, primaryTable, joins: validJoins },
    };
  }

  const secondaryConnectionId = String(joinObj.secondaryConnectionId ?? "").trim();
  const leftTable = String(joinObj.leftTable ?? "").trim();
  const rightTable = String(joinObj.rightTable ?? "").trim();
  if (!secondaryConnectionId || !leftTable || !rightTable) {
    return {
      ok: false,
      error:
        "JOIN simple inválido: faltan conexión secundaria o tablas. Editá el ETL y volvé a guardarlo.",
    };
  }
  return { ok: true, join: joinObj };
}

export function resolvePrimaryConnectionId(
  guided: Record<string, unknown>,
  join?: Record<string, unknown> | null
): string {
  if (join?.primaryConnectionId != null && String(join.primaryConnectionId).trim()) {
    return String(join.primaryConnectionId).trim();
  }
  if (join?.connectionId != null && String(join.connectionId).trim()) {
    return String(join.connectionId).trim();
  }
  return String(guided.connectionId ?? "").trim();
}
