"use client";

import type { ReactNode } from "react";
import { Building2 } from "lucide-react";

export function AdminClientGroupSection({
  clientLabel,
  count,
  children,
  className = "",
}: {
  clientId?: string | null;
  clientLabel: string;
  count: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 ${className}`.trim()}>
      <div
        className="flex flex-wrap items-center gap-2 sm:gap-3 border-b pb-3"
        style={{ borderColor: "var(--platform-border)" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
        >
          <Building2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-semibold truncate" style={{ color: "var(--platform-fg)" }}>
            {clientLabel}
          </h2>
          <p className="text-xs sm:text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            {count} {count === 1 ? "elemento" : "elementos"}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function AdminResourceCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}
