"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowLeft, Expand, Filter, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./mobile-dashboard-view.css";

export type MobileDashPageMeta = { id: string; name: string };

export type MobileDashWidgetLike = {
  id: string;
  title?: string;
  type?: string;
  isLoading?: boolean;
};

type MobileDashboardViewProps<T extends MobileDashWidgetLike> = {
  title: string;
  backHref?: string;
  backLabel?: string;
  pages?: MobileDashPageMeta[];
  activePageId?: string;
  onPageChange?: (pageId: string) => void;
  widgets: T[];
  /** Contenido de filtros globales + widgets filter (ya renderizado por el padre). */
  filtersContent?: ReactNode;
  hasFilters?: boolean;
  filtersPendingCommit?: boolean;
  onApplyFilters?: () => void;
  onClearFiltersDraft?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
  renderWidget: (widget: T, ctx: { compact?: boolean; focus?: boolean }) => ReactNode;
};

function isKpiWidget(w: MobileDashWidgetLike): boolean {
  return String(w.type ?? "").toLowerCase() === "kpi";
}

function isFilterWidget(w: MobileDashWidgetLike): boolean {
  return String(w.type ?? "").toLowerCase() === "filter";
}

function isFocusableWidget(w: MobileDashWidgetLike): boolean {
  const t = String(w.type ?? "").toLowerCase();
  return t !== "kpi" && t !== "filter" && t !== "text" && t !== "image";
}

function MobilePageTabs({
  pages,
  activePageId,
  onPageChange,
}: {
  pages: MobileDashPageMeta[];
  activePageId: string;
  onPageChange: (pageId: string) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const rail = railRef.current;
    const btn = tabRefs.current.get(activePageId);
    if (!rail || !btn) return;
    const target =
      btn.offsetLeft - rail.clientWidth / 2 + btn.offsetWidth / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activePageId, pages.length]);

  return (
    <div ref={railRef} className="mobile-dash-tabs" role="tablist" aria-label="Páginas del dashboard">
      {pages.map((p) => {
        const active = p.id === activePageId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            className="mobile-dash-tab"
            ref={(el) => {
              if (el) tabRefs.current.set(p.id, el);
              else tabRefs.current.delete(p.id);
            }}
            onClick={() => onPageChange(p.id)}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function MobileFilterSheet({
  open,
  onOpenChange,
  children,
  filtersPendingCommit,
  onApplyFilters,
  onClearFiltersDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  filtersPendingCommit?: boolean;
  onApplyFilters?: () => void;
  onClearFiltersDraft?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="mobile-dash-sheet-overlay"
        aria-label="Cerrar filtros"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="mobile-dash-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-dash-filters-title"
      >
        <div className="mobile-dash-sheet-handle" aria-hidden />
        <div className="mobile-dash-sheet-header">
          <h2 id="mobile-dash-filters-title" className="mobile-dash-sheet-title">
            Filtros
          </h2>
          <button
            type="button"
            className="mobile-dash-header-btn"
            aria-label="Cerrar"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mobile-dash-sheet-body">{children}</div>
        {(onApplyFilters || onClearFiltersDraft) && (
          <div className="mobile-dash-sheet-footer">
            {onClearFiltersDraft && (
              <Button type="button" variant="outline" onClick={onClearFiltersDraft}>
                Limpiar
              </Button>
            )}
            {onApplyFilters && (
              <Button
                type="button"
                disabled={!filtersPendingCommit}
                onClick={() => {
                  onApplyFilters();
                  onOpenChange(false);
                }}
                style={{
                  background: "var(--platform-accent, var(--client-accent, #0ea5e9))",
                  color: "#08080b",
                }}
              >
                Aplicar filtros
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function MobileFocusOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="mobile-dash-focus" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mobile-dash-focus-header">
        <h2 className="mobile-dash-focus-title">{title}</h2>
        <button type="button" className="mobile-dash-header-btn" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mobile-dash-focus-body">
        <div className="mobile-dash-focus-widget">{children}</div>
      </div>
    </div>
  );
}

export function MobileDashboardView<T extends MobileDashWidgetLike>({
  title,
  backHref,
  backLabel = "Volver",
  pages = [],
  activePageId,
  onPageChange,
  widgets,
  filtersContent,
  hasFilters = false,
  filtersPendingCommit = false,
  onApplyFilters,
  onClearFiltersDraft,
  isLoading = false,
  emptyMessage = "No hay widgets en este dashboard",
  renderWidget,
}: MobileDashboardViewProps<T>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusWidgetId, setFocusWidgetId] = useState<string | null>(null);

  const kpiWidgets = useMemo(() => widgets.filter(isKpiWidget), [widgets]);
  const stackWidgets = useMemo(
    () => widgets.filter((w) => !isKpiWidget(w) && !isFilterWidget(w)),
    [widgets]
  );
  const focusWidget = useMemo(
    () => (focusWidgetId ? widgets.find((w) => w.id === focusWidgetId) ?? null : null),
    [focusWidgetId, widgets]
  );

  const resolvedActivePageId = activePageId ?? pages[0]?.id ?? "";
  const showTabs = pages.length > 1;

  const handlePageChange = useCallback(
    (pageId: string) => {
      setFocusWidgetId(null);
      onPageChange?.(pageId);
    },
    [onPageChange]
  );

  return (
    <div className="mobile-dash">
      <header className="mobile-dash-header">
        {backHref ? (
          <Link
            href={backHref}
            className="mobile-dash-header-btn"
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <h1 className="mobile-dash-header-title">{title}</h1>
        {hasFilters ? (
          <button
            type="button"
            className="mobile-dash-header-btn"
            data-pending={filtersPendingCommit ? "true" : "false"}
            onClick={() => setFiltersOpen(true)}
            aria-label="Abrir filtros"
          >
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
          </button>
        ) : null}
      </header>

      {showTabs && resolvedActivePageId ? (
        <MobilePageTabs
          pages={pages}
          activePageId={resolvedActivePageId}
          onPageChange={handlePageChange}
        />
      ) : null}

      <div className="mobile-dash-body">
        {isLoading ? (
          <div className="mobile-dash-empty">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <div
            key={resolvedActivePageId || "page"}
            className={cn("mobile-dash-page")}
          >
            {kpiWidgets.length > 0 && (
              <div className="mobile-dash-kpi-rail" aria-label="Indicadores">
                {kpiWidgets.map((w) => (
                  <div key={w.id} className="mobile-dash-kpi-card">
                    {renderWidget(w, { compact: true })}
                  </div>
                ))}
              </div>
            )}

            {stackWidgets.length === 0 && kpiWidgets.length === 0 ? (
              <div className="mobile-dash-empty">{emptyMessage}</div>
            ) : (
              <div className="mobile-dash-stack">
                {stackWidgets.map((w) => {
                  const focusable = isFocusableWidget(w);
                  return (
                    <div
                      key={w.id}
                      className="mobile-dash-widget-card"
                      data-type={String(w.type ?? "chart")}
                      role={focusable ? "button" : undefined}
                      tabIndex={focusable ? 0 : undefined}
                      onClick={
                        focusable
                          ? (e) => {
                              // Evitar abrir foco al interactuar con controles internos (selects, etc.)
                              const target = e.target as HTMLElement | null;
                              if (
                                target?.closest(
                                  "button, a, input, select, textarea, [role='combobox'], [data-no-mobile-focus]"
                                )
                              ) {
                                return;
                              }
                              setFocusWidgetId(w.id);
                            }
                          : undefined
                      }
                      onKeyDown={
                        focusable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setFocusWidgetId(w.id);
                              }
                            }
                          : undefined
                      }
                    >
                      {focusable ? (
                        <span className="mobile-dash-widget-focus-hint" aria-hidden>
                          <Expand className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      {renderWidget(w, { compact: true })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {hasFilters && filtersContent ? (
        <MobileFilterSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filtersPendingCommit={filtersPendingCommit}
          onApplyFilters={onApplyFilters}
          onClearFiltersDraft={onClearFiltersDraft}
        >
          {filtersContent}
        </MobileFilterSheet>
      ) : null}

      {focusWidget ? (
        <MobileFocusOverlay
          title={String(focusWidget.title ?? "Gráfico")}
          onClose={() => setFocusWidgetId(null)}
        >
          {renderWidget(focusWidget, { focus: true })}
        </MobileFocusOverlay>
      ) : null}
    </div>
  );
}
