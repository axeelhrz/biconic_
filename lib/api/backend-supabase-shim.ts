"use client";

import { backendClient, isOwnBackendEnabled } from "@/lib/api/backend-client";
import { getBackendApiUrl } from "@/lib/api/backend-config";

type UserShape = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

async function fetchMe(): Promise<UserShape | null> {
  try {
    const me = await backendClient.auth.me();
    return {
      id: me.id,
      email: me.email ?? undefined,
      user_metadata: { full_name: me.full_name, app_role: me.app_role },
    };
  } catch {
    return null;
  }
}

class QueryBuilder {
  private filters: Array<{ col: string; op: string; val: unknown }> = [];
  private orClause: string | null = null;
  private columns = "*";
  private limitN?: number;
  private orderCol?: string;
  private orderAsc = true;
  private isUpdate = false;
  private isInsert = false;
  private isDelete = false;
  private updatePayload: Record<string, unknown> = {};
  private insertPayload: Record<string, unknown> | Record<string, unknown>[] =
    {};
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(private readonly table: string) {}

  select(cols = "*") {
    this.columns = cols;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }

  ilike(col: string, val: unknown) {
    this.filters.push({ col, op: "ilike", val });
    return this;
  }

  in(col: string, val: unknown[]) {
    this.filters.push({ col, op: "in", val });
    return this;
  }

  or(filter: string) {
    this.orClause = filter;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.isUpdate = true;
    this.updatePayload = payload;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.isInsert = true;
    this.insertPayload = payload;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this.execute();
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = { data: unknown; error: { message: string; code?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    const api = getBackendApiUrl();

    if (this.table === "profiles" && !this.isUpdate && !this.isInsert && !this.isDelete) {
      const user = await fetchMe();
      if (!user) return { data: null, error: { message: "No autenticado", code: "401" } };
      const row = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
        app_role: user.user_metadata?.app_role,
      };
      const inFilter = this.filters.find((f) => f.op === "in");
      if (inFilter && Array.isArray(inFilter.val)) {
        const ids = new Set(inFilter.val.map((v) => String(v)));
        if (ids.has(user.id)) {
          return { data: [row], error: null };
        }
        return { data: [], error: null };
      }
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: row, error: null };
      }
      return { data: [row], error: null };
    }

    if (this.table === "connections") {
      if (this.isUpdate) {
        const id = this.filters.find((f) => f.col === "id")?.val as string;
        const res = await fetch(`/api/connections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(this.updatePayload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: { message: json?.message ?? "Error" } };
        return { data: json, error: null };
      }
      const rows = await backendClient.connections.list();
      let data = rows as unknown[];
      for (const f of this.filters) {
        data = data.filter((r) => {
          const row = r as Record<string, unknown>;
          const v = row[f.col] ?? row[f.col.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
          if (f.op === "eq") return v === f.val;
          if (f.op === "ilike")
            return String(v ?? "").toLowerCase().includes(String(f.val).replace(/%/g, "").toLowerCase());
          return true;
        });
      }
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: data[0] ? null : { message: "No rows", code: "PGRST116" } };
      }
      return { data, error: null };
    }

    if (this.table === "dashboard" && !this.isUpdate && !this.isInsert) {
      const params = new URLSearchParams();
      for (const f of this.filters) {
        if (f.op === "eq" && f.col === "user_id") {
          params.set("eq_user_id", String(f.val));
        }
        if (f.op === "in" && f.col === "id" && Array.isArray(f.val)) {
          params.set("in_id", f.val.map(String).join(","));
        }
        if (f.op === "in" && f.col === "client_id" && Array.isArray(f.val)) {
          params.set("in_client_id", f.val.map(String).join(","));
        }
      }
      const qs = params.toString();
      const res = await fetch(`/api/viewer/dashboards${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json
            ? String((json as { error?: string }).error ?? "Error cargando dashboards")
            : "Error cargando dashboards";
        return { data: null, error: { message: msg } };
      }
      let data = Array.isArray(json) ? json : [];
      for (const f of this.filters) {
        if (f.op === "eq") {
          data = data.filter((r: Record<string, unknown>) => r[f.col] === f.val);
        }
        if (f.op === "in" && Array.isArray(f.val)) {
          const set = new Set(f.val.map(String));
          data = data.filter((r: Record<string, unknown>) => set.has(String(r[f.col])));
        }
      }
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    if (this.table === "client_members" && !this.isUpdate && !this.isInsert && !this.isDelete) {
      const res = await fetch("/api/viewer/client-members", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json
            ? String((json as { error?: string }).error ?? "Error cargando membresías")
            : "Error cargando membresías";
        return { data: null, error: { message: msg } };
      }
      let data = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
      for (const f of this.filters) {
        data = data.filter((r) => {
          const v = r[f.col];
          if (f.op === "eq") return v === f.val;
          if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(v);
          return true;
        });
      }
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    if (
      this.table === "dashboard_has_client_permissions" &&
      !this.isUpdate &&
      !this.isInsert &&
      !this.isDelete
    ) {
      const inFilter = this.filters.find((f) => f.op === "in" && f.col === "client_member_id");
      const memberIds = Array.isArray(inFilter?.val)
        ? inFilter.val.map(String).join(",")
        : "";
      const res = await fetch(
        `/api/viewer/dashboard-permissions?memberIds=${encodeURIComponent(memberIds)}`,
        { credentials: "include" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json
            ? String((json as { error?: string }).error ?? "Error cargando permisos")
            : "Error cargando permisos";
        return { data: null, error: { message: msg } };
      }
      let data = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
      for (const f of this.filters) {
        data = data.filter((r) => {
          const v = r[f.col];
          if (f.op === "eq") return v === f.val;
          if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(v);
          return true;
        });
      }
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    if (this.table === "clients" && !this.isUpdate && !this.isInsert && !this.isDelete) {
      const res = await fetch("/api/admin/clients/options", { credentials: "include" });
      const json = await res.json().catch(() => []);
      if (!res.ok) {
        return {
          data: null,
          error: { message: typeof json?.error === "string" ? json.error : "Error cargando clientes" },
        };
      }
      let data = (Array.isArray(json) ? json : []).map((row: { id: string; name: string }) => ({
        id: row.id,
        name: row.name,
        company_name: row.name,
        type: "empresa",
      })) as Record<string, unknown>[];
      for (const f of this.filters) {
        data = data.filter((r) => {
          const v = r[f.col];
          if (f.op === "eq") return v === f.val;
          if (f.op === "ilike") {
            const needle = String(f.val).replace(/%/g, "").toLowerCase();
            return String(v ?? "").toLowerCase().includes(needle);
          }
          if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(v);
          return true;
        });
      }
      if (this.orderCol) {
        const col = this.orderCol === "company_name" ? "name" : this.orderCol;
        data = [...data].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN) data = data.slice(0, this.limitN);
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    if (this.table === "etl" && !this.isUpdate && !this.isInsert && !this.isDelete) {
      const rows = await backendClient.etl.list();
      let data = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
      for (const f of this.filters) {
        data = data.filter((r) => {
          const v = r[f.col];
          if (f.op === "eq") return v === f.val;
          if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(v);
          return true;
        });
      }
      if (this.orderCol) {
        data = [...data].sort((a, b) => {
          const av = a[this.orderCol!];
          const bv = b[this.orderCol!];
          const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN) data = data.slice(0, this.limitN);
      if (this.wantSingle || this.wantMaybeSingle) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    if (this.table === "etl_runs_log") {
      if (this.isDelete) {
        const inFilter = this.filters.find((f) => f.op === "in" && f.col === "id");
        const ids = Array.isArray(inFilter?.val) ? inFilter.val.map(String) : [];
        const res = await fetch("/api/admin/etl-runs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: { message: json?.error ?? "Error" } };
        return { data: null, error: null };
      }
      if (!this.isUpdate && !this.isInsert) {
        const params = new URLSearchParams();
        if (this.columns !== "*") params.set("select", this.columns);
        for (const f of this.filters) {
          if (f.op === "eq") params.set(`eq_${f.col}`, String(f.val));
          if (f.op === "in" && Array.isArray(f.val)) {
            params.set(`in_${f.col}`, f.val.map(String).join(","));
          }
        }
        if (this.orderCol) {
          params.set("order", `${this.orderCol}:${this.orderAsc ? "asc" : "desc"}`);
        }
        if (this.limitN) params.set("limit", String(this.limitN));

        const res = await fetch(`/api/admin/etl-runs?${params}`, { credentials: "include" });
        const text = await res.text();
        let json: unknown = null;
        if (text.trim()) {
          try {
            json = JSON.parse(text);
          } catch {
            const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
            return {
              data: null,
              error: {
                message: preview.startsWith("<!DOCTYPE") || preview.startsWith("<html")
                  ? "La API devolvió HTML en lugar de JSON. Reiniciá npm run dev."
                  : preview || `Error ${res.status}`,
              },
            };
          }
        }
        if (!res.ok) {
          const msg =
            json && typeof json === "object" && "error" in json && typeof (json as { error?: string }).error === "string"
              ? (json as { error: string }).error
              : "Error cargando ejecuciones ETL";
          return { data: null, error: { message: msg } };
        }
        let data = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
        if (this.wantSingle || this.wantMaybeSingle) {
          return { data: data[0] ?? null, error: null };
        }
        return { data, error: null };
      }
    }

    return {
      data: null,
      error: {
        message: `Tabla "${this.table}" no disponible en modo backend propio todavía.`,
      },
    };
  }
}

export function createBackendShimClient() {
  return {
    auth: {
      async getUser() {
        const user = await fetchMe();
        return { data: { user }, error: user ? null : { message: "No autenticado" } };
      },
      async getSession() {
        const user = await fetchMe();
        return {
          data: { session: user ? { user } : null },
          error: null,
        };
      },
      onAuthStateChange(_cb: unknown) {
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      async signOut() {
        await backendClient.auth.logout();
        return { error: null };
      },
      async signInWithPassword() {
        return { data: null, error: { message: "Usa backendClient.auth.login" } };
      },
      async signUp() {
        return { data: null, error: { message: "Usa backendClient.auth.register" } };
      },
      async resetPasswordForEmail() {
        return { data: null, error: { message: "No disponible en backend propio" } };
      },
      async updateUser() {
        return { data: null, error: { message: "No disponible en backend propio" } };
      },
      async signInWithOAuth() {
        return { data: null, error: { message: "OAuth no disponible en backend propio" } };
      },
    },
    from(table: string) {
      return new QueryBuilder(table);
    },
    channel() {
      return { on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) };
    },
    removeChannel() {},
    storage: {
      from(_bucket: string) {
        return {
          async upload(
            path: string,
            file: File | Blob,
            _opts?: { cacheControl?: string; upsert?: boolean }
          ) {
            try {
              const key = path.startsWith("avatars/") ? path : `avatars/${path}`;
              const contentType =
                file instanceof File ? file.type : "application/octet-stream";
              const { url } = await backendClient.storage.uploadUrl(key, contentType);
              const res = await fetch(url, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": contentType },
              });
              if (!res.ok) {
                return { error: { message: `Error al subir archivo (${res.status})` } };
              }
              return { data: { path: key }, error: null };
            } catch (err) {
              return {
                error: {
                  message: err instanceof Error ? err.message : String(err),
                },
              };
            }
          },
          getPublicUrl(path: string) {
            const key = path.startsWith("avatars/") ? path : `avatars/${path}`;
            return {
              data: {
                publicUrl: `/api/admin/excel-file?key=${encodeURIComponent(key)}`,
              },
            };
          },
          async createSignedUrl(storagePath: string, _expiresIn: number) {
            return {
              data: {
                signedUrl: `/api/admin/excel-file?key=${encodeURIComponent(storagePath)}`,
              },
              error: null,
            };
          },
        };
      },
    },
    functions: {
      invoke: async () => ({ data: null, error: { message: "Edge functions deshabilitadas" } }),
    },
  };
}

export function getBrowserDataClient() {
  if (isOwnBackendEnabled()) {
    return createBackendShimClient();
  }
  return null;
}
