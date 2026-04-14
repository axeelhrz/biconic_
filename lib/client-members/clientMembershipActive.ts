/**
 * Filtro PostgREST para membresías de cliente consideradas vigentes.
 * `is_active` puede ser NULL en inserts legacy (p. ej. Edge Functions);
 * `.eq("is_active", true)` excluye NULL y el viewer no ve la empresa.
 * Solo `false` significa explícitamente inactivo.
 */
export const CLIENT_MEMBER_ACTIVE_OR_FILTER =
  "is_active.eq.true,is_active.is.null" as const;

export function isClientMembershipActive(
  isActive: boolean | null | undefined
): boolean {
  return isActive !== false;
}
