"use client";

import { useState, useEffect } from "react";
// import { createClient } from "@/lib/supabase/client"; // Not used directly in fetchData but good to keep if needed later

export interface ETLDataResponse {
  dashboard: {
    id: string;
    etl_id: string;
    etl?: {
      id: string;
      title: string;
      name: string;
    };
  };
  etl: {
    id: string;
    title: string;
    name: string;
  };
  etlData: {
    id: number;
    name: string;
    created_at: string;
    dataArray: any[];
    rowCount: number;
  };
  fields: {
    all: string[];
    numeric: string[];
    string: string[];
    date: string[];
  };
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

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Admin always uses the main editor endpoint for now
      // If admin needs a specific endpoint later, we change it here.
      const endpoint = `/api/dashboard/${dashboardId}/etl-data`;

      const response = await fetch(endpoint);
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Error al cargar datos del ETL (Admin)");
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
