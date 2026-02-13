"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface DashboardDataSource {
  id: string;
  etlId: string;
  alias: string;
  etlName: string;
  schema: string;
  tableName: string;
  rowCount: number;
  fields: {
    all: string[];
    numeric: string[];
    string: string[];
    date: string[];
  };
}

export interface ETLDataResponse {
  dashboard: {
    id: string;
    etl_id?: string | null;
    etl?: {
      id: string;
      title: string;
      name: string;
    } | null;
  };
  /** Múltiples fuentes de datos (ETLs) asociadas al dashboard (ventas, clientes, productos, etc.) */
  dataSources?: DashboardDataSource[];
  /** ID de la fuente principal (primera) para compatibilidad */
  primarySourceId?: string | null;
  etl: {
    id: string;
    title: string;
    name: string;
  } | null;
  etlData: {
    id: number;
    name: string;
    created_at: string;
    dataArray: any[];
    rowCount: number;
  } | null;
  fields: {
    all: string[];
    numeric: string[];
    string: string[];
    date: string[];
  };
}

export interface UseDashboardEtlDataReturn {
  data: ETLDataResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardEtlData(
  dashboardId: string,
  customEndpoint?: string
): UseDashboardEtlDataReturn {
  const [data, setData] = useState<ETLDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Si se provee un endpoint personalizado, usarlo.
      // Si no, fallback a la lógica de viewer/editor.
      let endpoint = customEndpoint;
      
      if (!endpoint) {
        const isViewerPath =
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/viewer/");
        endpoint = isViewerPath
            ? `/api/viewer/dashboard/${dashboardId}/etl-data`
            : `/api/dashboard/${dashboardId}/etl-data`;
      }

      const response = await fetch(endpoint);
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Error al cargar datos del ETL");
      }

      setData(result.data);
    } catch (err: any) {
      console.error("Error fetching ETL data:", err);
      setError(err.message || "Error al cargar datos del ETL");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dashboardId) {
      fetchData();
    }
  }, [dashboardId]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook for getting field options for dropdowns
export function useETLFieldOptions(etlData: ETLDataResponse | null) {
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
