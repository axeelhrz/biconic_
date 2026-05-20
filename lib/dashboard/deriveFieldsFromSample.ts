export type FieldsInfo = {
  all: string[];
  numeric: string[];
  string: string[];
  date: string[];
};

export function deriveFieldsFromSample(sampleData: Record<string, unknown>[]): FieldsInfo {
  if (sampleData.length === 0)
    return { all: [], numeric: [], string: [], date: [] };
  const sampleRow = sampleData[0] || {};
  const availableFields = Object.keys(sampleRow);
  const isNumericLike = (v: unknown): boolean => {
    if (typeof v === "number") return true;
    if (typeof v !== "string") return false;
    const trimmed = String(v).trim();
    if (!trimmed) return false;
    const sanitized = trimmed
      .replace(/\s+/g, "")
      .replace(/[%$€£]/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    return /^-?\d+(?:\.\d+)?$/.test(sanitized);
  };
  const numericFields = availableFields.filter((field) => {
    let nonNull = 0,
      numericCount = 0;
    for (const row of sampleData) {
      const val = row[field];
      if (val === null || val === undefined) continue;
      nonNull++;
      if (isNumericLike(val)) numericCount++;
    }
    return nonNull > 0 && numericCount / nonNull >= 0.6;
  });
  const stringFields = availableFields.filter((field) => {
    if (numericFields.includes(field)) return false;
    const val0 = sampleRow[field];
    if (typeof val0 === "string" && !isNumericLike(val0)) return true;
    let nonNull = 0,
      stringCount = 0;
    for (const row of sampleData) {
      const val = row[field];
      if (val === null || val === undefined) continue;
      nonNull++;
      if (typeof val === "string" && !isNumericLike(val)) stringCount++;
    }
    return nonNull > 0 && stringCount / nonNull >= 0.6;
  });
  const dateFields = availableFields.filter((field) => {
    let nonNull = 0,
      dateCount = 0;
    for (const row of sampleData) {
      const v = row[field];
      if (v === null || v === undefined) continue;
      nonNull++;
      if (typeof v === "string" && !isNaN(Date.parse(v))) dateCount++;
    }
    return nonNull > 0 && dateCount / nonNull >= 0.6;
  });
  return { all: availableFields, numeric: numericFields, string: stringFields, date: dateFields };
}
