"use client";

import { isOwnBackendEnabled, backendClient } from "@/lib/api/backend-client";

export async function fetchAggregateData(body: Record<string, unknown>) {
  if (isOwnBackendEnabled()) {
    return backendClient.dashboard.aggregateData(body);
  }
  const res = await fetch("/api/dashboard/aggregate-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function fetchDistinctValues(body: {
  tableName: string;
  field: string;
  limit?: number;
}) {
  if (isOwnBackendEnabled()) {
    return backendClient.dashboard.distinctValues(body);
  }
  const res = await fetch("/api/dashboard/distinct-values", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function fetchEtlRunStatus(runId: string) {
  if (isOwnBackendEnabled()) {
    const res = await fetch(`/api/etl/runs/${encodeURIComponent(runId)}`, {
      credentials: "include",
    });
    const { safeJsonResponse } = await import("@/lib/safe-json-response");
    const data = await safeJsonResponse<Record<string, unknown>>(res);
    if (!res.ok) {
      throw new Error(data.error ?? `Error ${res.status}`);
    }
    return data;
  }
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("etl_runs_log")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function subscribeEtlRunUpdates(
  runId: string,
  onUpdate: (row: Record<string, unknown>) => void
): () => void {
  if (isOwnBackendEnabled()) {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const row = await fetchEtlRunStatus(runId);
          if (row) onUpdate(row as Record<string, unknown>);
          if (
            row &&
            row.status !== "started" &&
            row.status !== "running"
          ) {
            break;
          }
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }

  let cancelled = false;
  const poll = async () => {
    while (!cancelled) {
      try {
        const row = await fetchEtlRunStatus(runId);
        if (row) onUpdate(row as Record<string, unknown>);
        if (
          row &&
          row.status !== "started" &&
          row.status !== "running"
        ) {
          break;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };
  poll();
  return () => {
    cancelled = true;
  };
}
