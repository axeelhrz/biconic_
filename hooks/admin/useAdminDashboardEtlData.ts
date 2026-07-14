"use client";

import { useState, useEffect, useRef } from "react";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { formatFetchErrorMessage } from "@/lib/fetch/abortError";
import type {
  DashboardDataset,
  DashboardDatasetWarnings,
} from "@/lib/dashboard/dashboardDataset";
import type { DatasetDimensionsMap } from "@/types/dashboard";

export interface DashboardDataSource {
  id: string;
  etlId: string;
  alias: string;
  etlName: string;
  schema: string;
  tableName: string;
  rowCount: number;
  fields: { all: string[]; numeric: string[]; string: string[]; date: string[] };
}

/** semantic_name -> data_source_id -> physical_column_name (Dataset del Dashboard) */
export type DatasetDimensions = DatasetDimensionsMap;

export interface ETLDataResponse {
  dashboard: { id: string; etl_id?: string | null; etl?: { id: string; title: string; name: string } | null };
  dataSources?: DashboardDataSource[];
  primarySourceId?: string | null;
  etl: { id: string; title: string; name: string } | null;
  etlData: { id: number; name: string; created_at: string; dataArray: any[]; rowCount: number } | null;
  fields: { all: string[]; numeric: string[]; string: string[]; date: string[] };
  datasetDimensions?: DatasetDimensions;
  dashboardDataset?: DashboardDataset;
  datasetWarnings?: DashboardDatasetWarnings;
}

export interface UseAdminDashboardEtlDataReturn {
  data: ETLDataResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAdminDashboardEtlData(
  dashboardId: string
): UseAdminDashboardEtlDataReturn {
  const [data, setData] = useState<ETLDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const REQUEST_TIMEOUT_MS = 30_000;
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchData = async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      setLoading(true);
      setError(null);

      const endpoint = `/api/dashboard/${dashboardId}/etl-data`;
      const timeoutId = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(endpoint, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      const result = await safeJsonResponse<{ data?: ETLDataResponse | null }>(response);

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Error al cargar datos del ETL (Admin)");
      }

      setData(result.data ?? null);
    } catch (err: unknown) {
      if (fetchAbortRef.current !== controller) return;
      console.error("Error fetching ETL data:", err);
      setError(formatFetchErrorMessage(err, "La carga del dashboard tardó demasiado"));
      setData(null);
    } finally {
      if (fetchAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (dashboardId) {
      void fetchData();
    }
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [dashboardId]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook for getting field options for dropdowns
export function useAdminETLFieldOptions(etlData: ETLDataResponse | null) {
  return {
    labelFieldOptions:
      etlData?.fields.all.map((field) => ({
        value: field,
        label: field,
      })) || [],

    valueFieldOptions:
      etlData?.fields.numeric.map((field) => ({
        value: field,
        label: field,
      })) || [],

    allFieldOptions:
      etlData?.fields.all.map((field) => ({
        value: field,
        label: `${field} (${getFieldType(field, etlData)})`,
      })) || [],
  };
}

function getFieldType(field: string, etlData: ETLDataResponse | null): string {
  if (!etlData) return "unknown";

  if (etlData.fields.numeric.includes(field)) return "number";
  if (etlData.fields.date.includes(field)) return "date";
  if (etlData.fields.string.includes(field)) return "text";

  return "unknown";
}
