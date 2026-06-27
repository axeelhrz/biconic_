/** Tamaño máximo de archivo Excel en subida (bytes). Override: EXCEL_UPLOAD_MAX_MB */
const DEFAULT_MAX_MB = 300;

function resolveMaxMb(): number {
  const raw = process.env.EXCEL_UPLOAD_MAX_MB?.trim();
  if (!raw) return DEFAULT_MAX_MB;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_MB;
  return Math.floor(parsed);
}

export const EXCEL_UPLOAD_MAX_MB = resolveMaxMb();
export const EXCEL_UPLOAD_MAX_BYTES = EXCEL_UPLOAD_MAX_MB * 1024 * 1024;
