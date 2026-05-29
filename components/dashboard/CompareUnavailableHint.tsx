"use client";

type CompareUnavailableHintProps = {
  reason?: string;
  className?: string;
};

/** Mensaje cuando no hay período comparativo equivalente. */
export function CompareUnavailableHint({ reason = "Sin período disponible", className = "" }: CompareUnavailableHintProps) {
  return (
    <div
      className={`text-center text-xs ${className}`.trim()}
      style={{ color: "var(--platform-fg-muted, #64748b)" }}
      role="status"
    >
      {reason}
    </div>
  );
}
