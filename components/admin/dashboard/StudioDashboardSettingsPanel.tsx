"use client";

import Link from "next/link";
import { BarChart2, Database, Palette, SlidersHorizontal } from "lucide-react";
import type { DashboardCompareDefaults, DashboardTheme } from "@/types/dashboard";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import { DashboardThemeFormSections } from "./DashboardThemeFormSections";
import { DashboardFiscalYearSection } from "./DashboardFiscalYearSection";
import { DashboardCompareDefaultsSection } from "./DashboardCompareDefaultsSection";
import { DashboardDatasetDiagnostics } from "./DashboardDatasetDiagnostics";
import { StudioCollapsibleSection } from "./StudioCollapsibleSection";
import { cn } from "@/lib/utils";

type GlobalFilterLike = { field?: string; operator?: string; value?: unknown };

export type StudioDashboardSettingsPanelProps = {
  open: boolean;
  etlData: ETLDataResponse | null;
  dashboardTheme: DashboardTheme;
  onThemeChange: (patch: Partial<DashboardTheme>) => void;
  fiscalYearStartMonth: number;
  onFiscalYearStartMonthChange: (month: number) => void;
  dashboardCompareDefaults: DashboardCompareDefaults;
  onDashboardCompareDefaultsChange: (next: DashboardCompareDefaults) => void;
  globalFilters: GlobalFilterLike[];
  studioFilterValues: Record<string, unknown>;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  onRemoveDataSource: (sourceId: string) => void;
  onAddDataSource: () => void;
  onRefetchEtl: () => void;
  dashboardId: string;
};

export function StudioDashboardSettingsPanel({
  open,
  etlData,
  dashboardTheme,
  onThemeChange,
  fiscalYearStartMonth,
  onFiscalYearStartMonthChange,
  dashboardCompareDefaults,
  onDashboardCompareDefaultsChange,
  globalFilters,
  studioFilterValues,
  showDiagnostics,
  onToggleDiagnostics,
  onRemoveDataSource,
  onAddDataSource,
  onRefetchEtl,
  dashboardId,
}: StudioDashboardSettingsPanelProps) {
  if (!open || !etlData) return null;

  const sourceCount = etlData.dataSources?.length ?? 0;
  const compareEnabled = dashboardCompareDefaults.enabled;

  return (
    <div
      className={cn(
        "studio-settings-panel border-b border-[var(--studio-border)] bg-[var(--studio-bg)] px-4 py-3",
        "animate-in slide-in-from-top-1 duration-200"
      )}
    >
      <p className="mb-3 text-xs text-[var(--studio-fg-muted)]">
        Opciones avanzadas del dashboard. Los filtros globales están en la barra superior; acá configurás fuentes, cálculos y apariencia.
      </p>
      <div className="grid gap-2 lg:grid-cols-2">
        <StudioCollapsibleSection
          title="Fuentes de datos"
          description={sourceCount > 0 ? `${sourceCount} fuente${sourceCount === 1 ? "" : "s"} conectada${sourceCount === 1 ? "" : "s"}` : "Sin fuentes"}
          icon={<Database className="h-4 w-4" />}
          badge={sourceCount > 0 ? String(sourceCount) : undefined}
        >
          <div className="space-y-3">
            {etlData.dataSources && etlData.dataSources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {etlData.dataSources.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--studio-accent-dim)] px-2.5 py-0.5 text-xs font-medium text-[var(--studio-accent)]"
                  >
                    {s.alias} ({s.etlName})
                    <button
                      type="button"
                      onClick={() => onRemoveDataSource(s.id)}
                      className="ml-0.5 rounded p-0.5 hover:bg-[var(--studio-accent)]/20"
                      aria-label={`Quitar ${s.alias}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--studio-fg-muted)]">No hay fuentes vinculadas.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAddDataSource}
                className="text-xs font-medium text-[var(--studio-accent)] hover:underline"
              >
                + Añadir fuente
              </button>
              {etlData.etl?.id ? (
                <Link
                  href={`/admin/etl/${etlData.etl.id}/metrics`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--studio-accent)] hover:underline"
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  Ir a métricas del ETL
                </Link>
              ) : null}
            </div>
            {sourceCount > 1 ? (
              <button
                type="button"
                onClick={onToggleDiagnostics}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  showDiagnostics
                    ? "border-[var(--studio-accent)] text-[var(--studio-accent)] bg-[var(--studio-accent-dim)]"
                    : "border-[var(--studio-border)] text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]"
                )}
              >
                {showDiagnostics ? "Ocultar diagnóstico de dataset" : "Mostrar diagnóstico de dataset"}
              </button>
            ) : null}
          </div>
        </StudioCollapsibleSection>

        <StudioCollapsibleSection
          title="Cálculos y comparaciones"
          description="Año fiscal y comparaciones por defecto"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          badge={compareEnabled ? "Activo" : undefined}
        >
          <div className="space-y-3">
            <DashboardFiscalYearSection
              fiscalYearStartMonth={fiscalYearStartMonth}
              onChange={onFiscalYearStartMonthChange}
            />
            <DashboardCompareDefaultsSection
              defaults={dashboardCompareDefaults}
              onChange={onDashboardCompareDefaultsChange}
              globalFilters={globalFilters}
              filterValues={studioFilterValues}
              dateFields={etlData.dataSources?.[0]?.fields?.date ?? []}
            />
          </div>
        </StudioCollapsibleSection>

        <StudioCollapsibleSection
          title="Apariencia del dashboard"
          description="Colores, tipografía y logo"
          icon={<Palette className="h-4 w-4" />}
          className="lg:col-span-2"
        >
          <DashboardThemeFormSections
            scope="global"
            value={dashboardTheme}
            onPatch={onThemeChange}
            labelClassName="studio-appearance-label"
            inputClassName="studio-appearance-input h-9"
          />
        </StudioCollapsibleSection>
      </div>

      {showDiagnostics && etlData.dashboardDataset && etlData.dataSources && etlData.dataSources.length > 1 ? (
        <div className="mt-3">
          <DashboardDatasetDiagnostics
            dashboardId={dashboardId}
            dataset={etlData.dashboardDataset}
            dataSources={etlData.dataSources.map((s) => ({
              id: s.id,
              alias: s.alias,
              etlName: s.etlName,
              fields: s.fields,
            }))}
            warnings={etlData.datasetWarnings}
            onUpdated={() => void onRefetchEtl()}
          />
        </div>
      ) : null}
    </div>
  );
}
