"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { safeJsonResponse } from "@/lib/safe-json-response";
import type { DashboardDataset } from "@/lib/dashboard/dashboardDataset";
import { SEMANTIC_DIMENSION_LABELS } from "@/lib/dashboard/dashboardDataset";
import type { DashboardDatasetWarnings } from "@/lib/dashboard/dashboardDataset";
import { cn } from "@/lib/utils";

type DataSourceMeta = { id: string; alias: string; etlName: string; fields: { all: string[] } };

type Props = {
  dashboardId: string;
  dataset: DashboardDataset;
  dataSources: DataSourceMeta[];
  warnings?: DashboardDatasetWarnings;
  onUpdated: () => void;
};

export function DashboardDatasetDiagnostics({
  dashboardId,
  dataset,
  dataSources,
  warnings,
  onUpdated,
}: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const patchMapping = useCallback(
    async (dimensionId: string, sourceId: string, physicalColumn: string) => {
      const key = `${dimensionId}-${sourceId}`;
      setSaving(key);
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/dashboard-dataset`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dimensionId, sourceId, physicalColumn }),
        });
        const json = await safeJsonResponse(res);
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al guardar");
        onUpdated();
      } finally {
        setSaving(null);
      }
    },
    [dashboardId, onUpdated]
  );

  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    try {
      const res = await fetch(`/api/dashboard/${dashboardId}/dashboard-dataset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al re-detectar");
      onUpdated();
    } finally {
      setRebuilding(false);
    }
  }, [dashboardId, onUpdated]);

  if (dataSources.length <= 1) {
    return (
      <p className="text-xs text-[var(--studio-fg-muted)] px-2 py-1">
        El Dataset del Dashboard se activa cuando hay más de una fuente de datos (ETL).
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)] p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-[var(--studio-fg)]">Dataset del Dashboard</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={rebuilding}
          onClick={handleRebuild}
        >
          {rebuilding ? "Re-detectando…" : "Re-detectar dimensiones"}
        </Button>
      </div>
      <p className="text-[var(--studio-fg-muted)]">
        Capa semántica automática. Corregí solo si la detección falló; los cambios manuales no se
        sobrescriben al re-detectar.
      </p>
      {(warnings?.unmappedSources?.length ?? 0) > 0 && (
        <p className="text-amber-700 dark:text-amber-300">
          Sin mapeo:{" "}
          {warnings!.unmappedSources
            .map((u) => `${SEMANTIC_DIMENSION_LABELS[u.dimensionId] ?? u.dimensionId} / ${u.sourceAlias ?? u.sourceId}`)
            .join("; ")}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--studio-border)]">
              <th className="py-1 pr-2 font-medium text-[var(--studio-fg-muted)]">Dimensión</th>
              {dataSources.map((ds) => (
                <th key={ds.id} className="py-1 px-1 font-medium text-[var(--studio-fg-muted)] truncate max-w-[120px]">
                  {ds.alias || ds.etlName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.dimensions.map((dim) => (
              <tr key={dim.id} className="border-b border-[var(--studio-border)]/50">
                <td className="py-1.5 pr-2 text-[var(--studio-fg)] whitespace-nowrap">
                  {dim.label}
                </td>
                {dataSources.map((ds) => {
                  const mapping = dim.mappings.find((m) => m.sourceId === ds.id);
                  const col = mapping?.physicalColumn ?? "";
                  const origin = mapping?.origin;
                  const conf = mapping?.confidence;
                  const lowConf = conf != null && conf < 0.6;
                  return (
                    <td key={ds.id} className="py-1 px-1 align-top">
                      <select
                        className={cn(
                          "w-full max-w-[140px] rounded border border-[var(--studio-border)] bg-[var(--studio-bg)] px-1 py-0.5 text-[10px]",
                          lowConf && "border-amber-500/60"
                        )}
                        value={col}
                        disabled={saving === `${dim.id}-${ds.id}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) void patchMapping(dim.id, ds.id, v);
                        }}
                      >
                        <option value="">—</option>
                        {ds.fields.all.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      {origin && (
                        <span
                          className={cn(
                            "block mt-0.5 text-[9px]",
                            origin === "manual"
                              ? "text-[var(--studio-accent)]"
                              : "text-[var(--studio-fg-muted)]"
                          )}
                        >
                          {origin}
                          {conf != null ? ` ${Math.round(conf * 100)}%` : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
