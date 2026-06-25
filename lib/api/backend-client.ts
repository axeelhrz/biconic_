"use client";

import { getBackendApiUrl } from "./backend-config";

type ApiOptions = RequestInit & { json?: unknown };

/** En el navegador usamos el proxy de Next.js para que las cookies queden en :3000. */
function getClientApiBase(): string {
  return "/api";
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = `${getClientApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 4000)."
    );
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
      const htmlHint = preview.startsWith("<!DOCTYPE") || preview.startsWith("<html");
      throw new Error(
        htmlHint
          ? `La API devolvió HTML en lugar de JSON (${res.status}). Revisá que la ruta exista y que estés autenticado.`
          : preview || `Error del servidor (${res.status})`
      );
    }
  }
  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : res.status === 500 || res.status === 503
            ? "El backend no está disponible. Ejecuta: cd backend && npm run start:local"
            : `Error ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const backendClient = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ user: { id: string; email: string; app_role: string } }>(
        "/auth/login",
        { method: "POST", json: { email, password } }
      ),
    register: (email: string, password: string, fullName?: string) =>
      apiFetch<{ user: { id: string; email: string; app_role: string } }>(
        "/auth/register",
        { method: "POST", json: { email, password, fullName } }
      ),
    logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    me: () =>
      apiFetch<{ id: string; email: string; app_role: string; full_name?: string }>(
        "/auth/me"
      ),
    refresh: () =>
      apiFetch<{ user: { id: string; email: string; app_role: string } }>(
        "/auth/refresh",
        { method: "POST" }
      ),
  },
  dashboard: {
    aggregateData: (body: Record<string, unknown>) =>
      apiFetch<unknown>("/dashboard/aggregate-data", { method: "POST", json: body }),
    distinctValues: (body: { tableName: string; field: string; limit?: number }) =>
      apiFetch<unknown[]>("/dashboard/distinct-values", { method: "POST", json: body }),
    rawData: (body: { tableName: string; limit?: number; offset?: number }) =>
      apiFetch<unknown[]>("/dashboard/raw-data", { method: "POST", json: body }),
  },
  connections: {
    list: () => apiFetch<unknown[]>("/connections"),
    create: (body: { name: string; type: string; clientId?: string; config?: unknown }) =>
      apiFetch<unknown>("/connections", { method: "POST", json: body }),
  },
  etl: {
    list: () => apiFetch<unknown[]>("/etl"),
    run: (body: { etlId: string } & Record<string, unknown>) =>
      apiFetch<{ runId: string; status: string }>("/etl/run", { method: "POST", json: body }),
    runStatus: (runId: string) => apiFetch<unknown>(`/etl/runs/${runId}`),
  },
  storage: {
    uploadUrl: (key: string, contentType: string) =>
      apiFetch<{ url: string; key: string }>("/storage/upload-url", {
        method: "POST",
        json: { key, contentType },
      }),
    processExcel: (connectionId: string, objectKey: string) =>
      apiFetch<{ jobId: string; status: string }>("/storage/excel/process", {
        method: "POST",
        json: { connectionId, objectKey },
      }),
  },
};

export function isOwnBackendEnabled(): boolean {
  return true;
}
