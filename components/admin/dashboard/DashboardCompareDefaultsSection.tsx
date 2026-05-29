"use client";

import type { DashboardCompareDefaults } from "@/types/dashboard";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";
import { buildDashboardCompareContexts } from "@/lib/dashboard/compareContext";
import { CompareSpecFields } from "@/components/admin/dashboard/CompareSpecFields";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { dimensionsListFromAgg, pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";

type GlobalFilterLike = { field?: string; operator?: string; value?: unknown };

export type DashboardCompareDefaultsSectionProps = {
  defaults: DashboardCompareDefaults | undefined;
  onChange: (next: DashboardCompareDefaults) => void;
  globalFilters: GlobalFilterLike[];
  filterValues: Record<string, unknown>;
  dateFields?: string[];
};

function emptyDefaults(): DashboardCompareDefaults {
  return {
    enabled: false,
    compare: { kind: "none" },
    label: "",
    showDelta: true,
    showDeltaPct: true,
  };
}

function resolveFilterValues(
  globalFilters: GlobalFilterLike[],
  filterValues: Record<string, unknown>
): GlobalFilterLike[] {
  return globalFilters.map((f) => {
    const id = (f as { id?: string }).id;
    const v = id != null && id in filterValues ? filterValues[id] : f.value;
    return { ...f, value: v };
  });
}

export function DashboardCompareDefaultsSection({
  defaults,
  onChange,
  globalFilters,
  filterValues,
  dateFields = [],
}: DashboardCompareDefaultsSectionProps) {
  const d = defaults ?? emptyDefaults();
  const compare = d.compare?.kind !== "none" ? d.compare : ({ kind: "none" } as CompareSpec);
  const timeColumnDefault = pickDateGroupBySourceField({ dateDimension: dateFields[0] }) || dateFields[0] || "fecha";
  const activeFilters = resolveFilterValues(globalFilters, filterValues);

  const contextPreview =
    d.enabled && compare.kind !== "none"
      ? buildDashboardCompareContexts({ filters: activeFilters, compareSpec: compare })
      : null;

  const setCompare = (next: CompareSpec) => {
    onChange({ ...d, compare: next, enabled: next.kind !== "none" ? true : d.enabled });
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-[var(--studio-fg)]">Comparaciones del dashboard</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="dash-compare-enabled"
            checked={d.enabled}
            onCheckedChange={(c) => onChange({ ...d, enabled: c === true })}
          />
          <Label htmlFor="dash-compare-enabled" className="text-[11px] text-[var(--studio-fg-muted)]">
            Habilitar
          </Label>
        </div>
      </div>
      {d.enabled ? (
        <>
          <CompareSpecFields
            variant="studio"
            compare={compare}
            setCompare={setCompare}
            timeColumnDefault={timeColumnDefault}
            timeColumnOptions={dateFields}
            granularity={"month" as DateGranularity}
            dims={[]}
            compareColumnCandidates={[]}
            fixedValue=""
            onFixedValueChange={() => {}}
          />
          <div>
            <Label className="text-[11px] text-[var(--studio-fg-muted)]">Etiqueta por defecto</Label>
            <Input
              className="mt-0.5 h-8 border-[var(--studio-border)] bg-[var(--studio-bg-elevated)] text-xs"
              value={d.label ?? ""}
              placeholder="ej. vs mismo período FY anterior"
              onChange={(e) => onChange({ ...d, label: e.target.value })}
            />
          </div>
          {contextPreview ? (
            <p className="text-[10px] text-[var(--studio-fg-muted)]">
              {contextPreview.comparable
                ? contextPreview.compareLabel
                  ? `Contexto: ${contextPreview.compareLabel}`
                  : "Contexto comparativo listo según filtros activos."
                : contextPreview.unavailableReason ?? "Sin período disponible con los filtros actuales."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[10px] text-[var(--studio-fg-muted)]">
          Los widgets heredan esta comparación por defecto (contexto = filtros del dashboard).
        </p>
      )}
    </div>
  );
}
