/**
 * Helpers para alinear inputType (select/multi/…) con operator (IN/=/…).
 * Evita que un operator IN stale fuerce multi cuando el usuario eligió lista desplegable.
 */

export type FilterInputTypeLike = string | null | undefined;

const EXPLICIT_SINGLE_INPUT_TYPES = new Set([
  "select",
  "search",
  "number",
  "date",
  "text",
]);

/**
 * Resuelve inputType efectivo.
 * Legacy: sin inputType + operator IN → multi; sin inputType → select.
 */
export function resolveFilterInputType(filter: {
  inputType?: FilterInputTypeLike;
  operator?: string | null;
  filterType?: string | null;
}): string {
  const explicit = String(filter.inputType ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  const legacy = String(filter.filterType ?? "").trim().toLowerCase();
  if (legacy === "multi") return "multi";
  if (legacy === "single") return "select";
  if (String(filter.operator ?? "").trim().toUpperCase() === "IN") return "multi";
  return "select";
}

/** ¿El control de UI debe ser selección múltiple? */
export function isMultiSelectFilterInput(filter: {
  inputType?: FilterInputTypeLike;
  operator?: string | null;
  filterType?: string | null;
}): boolean {
  return resolveFilterInputType(filter) === "multi";
}

/** ¿Debe mostrarse lista desplegable / multi (no campo de texto libre)? */
export function wantsSelectableFilterControl(filter: {
  inputType?: FilterInputTypeLike;
  operator?: string | null;
  filterType?: string | null;
}): boolean {
  const t = resolveFilterInputType(filter);
  return t === "select" || t === "multi";
}

/**
 * Reconcilia operator al cambiar/guardar inputType.
 * - multi (no fecha) → IN
 * - select/search/number/text con IN stale → =
 * - fechas: no fuerza IN; deja el operator temporal.
 */
export function reconcileFilterOperatorWithInputType(options: {
  operator?: string | null;
  inputType?: FilterInputTypeLike;
  isDateField?: boolean;
}): string {
  const inputType = resolveFilterInputType({
    inputType: options.inputType,
    operator: options.operator,
  });
  const current = String(options.operator ?? "=").trim() || "=";
  const opUpper = current.toUpperCase();
  const temporalOps = new Set(["YEAR", "MONTH", "DAY", "YEAR_MONTH", "SEMESTER", "QUARTER"]);

  if (options.isDateField) {
    return current;
  }

  // Campos no fecha no deben conservar nivel temporal (YEAR/MONTH/…).
  if (temporalOps.has(opUpper)) {
    return inputType === "multi" ? "IN" : "=";
  }

  if (inputType === "multi") {
    return "IN";
  }

  if (opUpper === "IN") {
    return "=";
  }

  return current;
}

/**
 * ¿Al aplicar el filtro al SQL debe usarse IN?
 * Prioriza inputType; solo usa operator IN si no hay inputType explícito single.
 */
export function shouldApplyFilterAsIn(options: {
  operator?: string | null;
  inputType?: FilterInputTypeLike;
  filterType?: string | null;
  value?: unknown;
  /** Operadores temporales que ya aceptan arrays sin forzar IN (YEAR, MONTH, …). */
  isDateMultiValueOperator?: boolean;
}): boolean {
  if (options.isDateMultiValueOperator) return false;
  const inputType = resolveFilterInputType({
    inputType: options.inputType,
    operator: options.operator,
    filterType: options.filterType,
  });
  if (inputType === "multi") {
    return Array.isArray(options.value) ? options.value.length > 0 : options.value != null && options.value !== "";
  }
  if (EXPLICIT_SINGLE_INPUT_TYPES.has(inputType)) {
    return false;
  }
  return String(options.operator ?? "").trim().toUpperCase() === "IN";
}

/** Normaliza un filtro global al cargar (inputType + operator coherentes). */
export function normalizeLoadedGlobalFilter<
  T extends {
    field?: string;
    operator?: string | null;
    inputType?: FilterInputTypeLike;
    filterType?: string | null;
  },
>(filter: T, isDateField = false): T & { inputType: string; operator: string } {
  const inputType = resolveFilterInputType(filter);
  const operator = reconcileFilterOperatorWithInputType({
    operator: filter.operator,
    inputType,
    isDateField,
  });
  return { ...filter, inputType, operator };
}
