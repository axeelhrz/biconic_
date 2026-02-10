"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FolderOpen, Users, Eye, CreditCard } from "lucide-react";
import Link from "next/link";
import { Database } from "@/lib/supabase/database.types";
import EditSubscriptionDialog from "./EditSubscriptionDialog";

type FilterType = "todos" | "activos" | "inactivos";
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type BillingInterval = Database["public"]["Enums"]["billing_interval"];

export interface ClientRow {
  id: string;
  name: string;
  plan: string | null;
  status: string | null; // "Activo" | "Desactivado" | ...
  dashboards: number;
  members: number;
  location?: string;
  industry?: string | null; // placeholder until field exists
  subscription?: {
    id: string;
    plan_id: string;
    status: SubscriptionStatus;
    billing_interval: BillingInterval;
  } | null;
}

export default function AdminClientTable() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("todos");
  
  // Subscription Edit State
  const [selectedSubscription, setSelectedSubscription] = useState<ClientRow["subscription"] | null>(null);
  const [isEditSubscriptionOpen, setIsEditSubscriptionOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Function to refresh data, can be passed to dialog
  const refreshData = async () => {
      // Re-trigger the useEffect logic essentially. 
      // Ideally this logic should be in a separate function to be callable, 
      // but for now we can rely on next/cache revalidatePath from the action 
      // or just force a re-fetch.
      // A simple way is to toggle a refresh trigger or just call valid load function if refactored.
      // For this step I will refactor the load logic slightly to be callable.
       await loadData();
  };

  const loadData = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: ures, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        if (!ures.user) {
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        let query = supabase
          .from("clients")
          .select(
            `id, company_name, status, capital, countries(name), 
             subscriptions(id, plan_id, status, billing_interval, plans(name)), 
             dashboard(count), client_members(count)`,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (search.trim()) {
          query = query.ilike("company_name", `%${search.trim()}%`);
        }
        if (filter !== "todos") {
          const target = filter === "activos" ? "Activo" : "Desactivado";
          query = query.eq("status", target);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        const mapped = (data ?? []).map((r: any) => {
          const dashboards = r?.dashboard?.[0]?.count ?? 0;
          const members = r?.client_members?.[0]?.count ?? 0;
          
          let plan = null;
          let subscription = null;
          
          if (r?.subscriptions && r.subscriptions.length > 0) {
              const sub = r.subscriptions[0];
              plan = sub.plans?.name ?? null;
              subscription = {
                  id: sub.id,
                  plan_id: sub.plan_id,
                  status: sub.status,
                  billing_interval: sub.billing_interval
              };
          }

          const status = r?.status ?? null;
          const countryName = r?.countries?.name ?? "";
          const city = r?.capital ?? "";
          
          let location = "—";
          if (city && countryName) location = `${city}, ${countryName}`;
          else if (countryName) location = countryName;
          else if (city) location = city;

          return {
            id: r.id as string,
            name: r.company_name ?? "—",
            plan,
            status,
            dashboards,
            members,
            location,
            industry: "Tecnología",
            subscription,
          } as ClientRow;
        });

        setRows(mapped);
        setTotal(count ?? mapped.length);
      } catch (e) {
        console.error(e);
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, search, filter]);

  const handleEditSubscription = (subscription: ClientRow["subscription"] | null, clientId: string) => {
      setSelectedSubscription(subscription);
      setSelectedClientId(clientId);
      setIsEditSubscriptionOpen(true);
  };


  return (
    <div
      className="flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border px-10 py-8"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--platform-fg)" }}>
          Clientes
        </h2>
        <Button
          variant="outline"
          className="h-[34px] rounded-full"
          style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
          onClick={() => exportCSV(rows)}
        >
          Exportar
        </Button>
      </div>

      <div
        className="flex items-center justify-between gap-4 border-b px-[15px] py-[3px] text-[12px] font-semibold"
        style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
      >
        <div className="w-5"></div>
        <div className="w-[240px]">Cliente</div>
        <div className="w-[120px]">Plan</div>
        <div className="w-[120px]">Estado</div>
        <div className="w-[120px]">Proyectos</div>
        <div className="w-[120px]">Usuarios</div>
        <div className="w-[120px]">Industria</div>
        <div className="w-[100px] text-center">Acciones</div>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
        {loading && <SkeletonRows />}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            No hay clientes para mostrar.
          </div>
        )}
        {!loading &&
          rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 px-[15px] py-2.5 text-sm"
              style={{ color: "var(--platform-fg)" }}
            >
              <div className="h-5 w-5 rounded-md border" style={{ borderColor: "var(--platform-border)" }} />

              <div className="flex w-[240px] items-center gap-2">
                <div
                  className="flex h-[35px] w-[35px] items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  {initials(r.name)}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px]" style={{ color: "var(--platform-fg)" }}>
                    {r.name}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--platform-fg-muted)" }}>
                    {r.location}
                  </span>
                </div>
              </div>

              <div className="w-[120px]">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  {r.plan ?? "—"}
                </span>
              </div>

              <div className="w-[120px]">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-[14px] font-medium",
                    r.status?.toLowerCase() === "activo" && "bg-[var(--platform-success-dim)]",
                    r.status?.toLowerCase() === "desactivado" && "bg-[var(--platform-danger)]/20"
                  )}
                  style={{
                    color:
                      r.status?.toLowerCase() === "activo"
                        ? "var(--platform-success)"
                        : r.status?.toLowerCase() === "desactivado"
                        ? "var(--platform-danger)"
                        : "var(--platform-fg-muted)",
                    ...(r.status?.toLowerCase() !== "activo" && r.status?.toLowerCase() !== "desactivado"
                      ? { background: "var(--platform-surface-hover)" }
                      : {}),
                  }}
                >
                  {r.status ?? "—"}
                </span>
              </div>

              <div className="flex w-[120px] items-center gap-1" style={{ color: "var(--platform-accent)" }}>
                <FolderOpen className="h-5 w-5" />
                <span className="text-[14px]">{r.dashboards}</span>
              </div>

              <div className="flex w-[120px] items-center gap-1" style={{ color: "var(--platform-accent)" }}>
                <Users className="h-5 w-5" />
                <button className="text-[14px] underline" title="Ver usuarios">
                  {r.members}
                </button>
              </div>

              <div className="w-[120px]">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
                  style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}
                >
                  {r.industry ?? "—"}
                </span>
              </div>

              <div className="flex w-[100px] items-center justify-center">
                <Link
                  href={`/admin/clients/${r.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:opacity-80"
                  style={{ color: "var(--platform-fg)" }}
                  aria-label="Ver"
                >
                  <Eye className="h-5 w-5" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:opacity-80"
                  style={{ color: "var(--platform-fg)" }}
                  onClick={() => handleEditSubscription(r.subscription ?? null, r.id)}
                  title={r.subscription ? "Editar Suscripción" : "Asignar Suscripción"}
                >
                  <CreditCard className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
      </div>

      <div
        className="flex items-center justify-center gap-4 py-2.5"
        style={{ background: "var(--platform-surface)" }}
      >
        <Button
          variant="ghost"
          className="h-[30px] rounded-xl"
          style={{ color: "var(--platform-fg-muted)" }}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          Anterior
        </Button>
        <div className="flex items-center gap-3">
          {useMemo(() => {
            const nums: number[] = [];
            const start = Math.max(1, page - 2);
            const end = Math.min(totalPages, start + 4);
            for (let i = start; i <= end; i++) nums.push(i);
            return nums;
          }, [page, totalPages]).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[14px] font-semibold"
              style={{
                background: n === page ? "var(--platform-accent)" : "var(--platform-surface-hover)",
                color: n === page ? "#08080b" : "var(--platform-fg)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          className="h-[30px] rounded-xl"
          style={{ color: "var(--platform-accent)" }}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Siguiente
        </Button>
      </div>

      {isEditSubscriptionOpen && (
        <EditSubscriptionDialog
          open={isEditSubscriptionOpen}
          onOpenChange={setIsEditSubscriptionOpen}
          subscription={selectedSubscription ?? null}
          clientId={selectedClientId}
          onSaved={refreshData}
        />
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-[34px] rounded-full px-3 text-[13px] font-medium"
      style={{
        background: active ? "var(--platform-accent)" : "transparent",
        color: active ? "#08080b" : "var(--platform-accent)",
        border: `1px solid var(--platform-accent)`,
      }}
    >
      {label}
    </button>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 px-[15px] py-2.5"
        >
          {Array.from({ length: 8 }).map((__, j) => (
            <div
              key={j}
              className="h-4 w-full max-w-[200px] animate-pulse rounded"
              style={{ background: "var(--platform-surface-hover)" }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function exportCSV(rows: ClientRow[]) {
  const header = [
    "id",
    "name",
    "plan",
    "status",
    "dashboards",
    "members",
    "industry",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.id,
        escapeCsv(r.name),
        r.plan ?? "",
        r.status ?? "",
        r.dashboards,
        r.members,
        r.industry ?? "",
      ].join(",")
    )
  );
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clientes.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}
