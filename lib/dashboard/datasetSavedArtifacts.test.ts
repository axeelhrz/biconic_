import { describe, expect, it } from "vitest";
import {
  mergeDatasetConfigArtifacts,
  readSavedMetricsFromDatasetConfig,
  resolveSavedArtifacts,
} from "./datasetSavedArtifacts";

describe("datasetSavedArtifacts", () => {
  it("reads saved_metrics from dataset config", () => {
    expect(readSavedMetricsFromDatasetConfig({ saved_metrics: [{ id: "1" }] })).toEqual([
      { id: "1" },
    ]);
  });

  it("merges metrics into dataset config without dropping derived columns", () => {
    const next = mergeDatasetConfigArtifacts(
      { derivedColumns: [{ name: "x", expression: "1" }], saved_metrics: [] },
      { savedMetrics: [{ id: "m1", name: "Ventas" }] }
    );
    expect(next.derivedColumns).toEqual([{ name: "x", expression: "1" }]);
    expect(next.saved_metrics).toEqual([{ id: "m1", name: "Ventas" }]);
  });

  it("prefers dataset artifacts over etl layout", () => {
    const resolved = resolveSavedArtifacts({
      datasetConfig: { saved_metrics: [{ id: "ds" }], saved_analyses: [{ id: "a1" }] },
      etlLayout: { saved_metrics: [{ id: "etl" }], saved_analyses: [{ id: "a0" }] },
    });
    expect(resolved.savedMetrics).toEqual([{ id: "ds" }]);
    expect(resolved.savedAnalyses).toEqual([{ id: "a1" }]);
  });

  it("falls back to etl layout when dataset has no artifacts", () => {
    const resolved = resolveSavedArtifacts({
      datasetConfig: { derivedColumns: [] },
      etlLayout: { saved_metrics: [{ id: "etl" }] },
    });
    expect(resolved.savedMetrics).toEqual([{ id: "etl" }]);
  });
});
