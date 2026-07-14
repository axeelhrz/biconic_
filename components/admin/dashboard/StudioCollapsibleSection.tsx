"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioCollapsibleSectionProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
  className?: string;
};

export function StudioCollapsibleSection({
  title,
  description,
  icon,
  defaultOpen = false,
  badge,
  children,
  className,
}: StudioCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {icon ? <span className="shrink-0 text-[var(--studio-accent)]">{icon}</span> : null}
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--studio-fg)]">{title}</span>
            {description && !open ? (
              <span className="block truncate text-[10px] text-[var(--studio-fg-muted)]">{description}</span>
            ) : null}
          </span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-[var(--studio-accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--studio-accent)]">
              {badge}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--studio-muted)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--studio-muted)]" />
        )}
      </button>
      {open ? <div className="border-t border-[var(--studio-border)] p-3">{children}</div> : null}
    </div>
  );
}
