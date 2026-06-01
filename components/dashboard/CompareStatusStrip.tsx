"use client";

import type { WidgetCompareStatus } from "@/lib/dashboard/compareDisplayKeys";

type CompareStatusStripProps = {
  status: WidgetCompareStatus;
  className?: string;
};

/** Badge + línea de comparación visible en la tarjeta del widget. */
export function CompareStatusStrip({ status, className = "" }: CompareStatusStripProps) {
  if (!status.active) return null;

  return (
    <div className={`space-y-1 ${className}`.trim()}>
      {status.badge ? (
        <span className="inline-flex max-w-full items-center rounded-full bg-[var(--studio-accent,var(--platform-accent,#0ea5e9))]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--studio-accent,var(--platform-accent,#0ea5e9))]">
          {status.badge}
        </span>
      ) : null}
      {status.line ? (
        <p className="text-[11px] font-medium tabular-nums text-[var(--studio-accent,var(--platform-accent,#0ea5e9))]">
          {status.line}
        </p>
      ) : status.unavailable ? (
        <p className="text-[10px] text-amber-600 dark:text-amber-400" role="status">
          {status.reason ?? "Sin período comparativo"}
        </p>
      ) : null}
    </div>
  );
}
