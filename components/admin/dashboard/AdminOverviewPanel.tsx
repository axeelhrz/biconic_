"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Workflow,
  Link2,
  Plus,
  ChevronRight,
  X,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

type StatsCounts = {
  dashboards: number;
  clients: number;
  etls: number;
  connections: number;
};

type ClientWithCounts = {
  id: string;
  company_name: string;
  dashboardsCount: number;
  etlsCount: number;
  membersCount: number;
  status?: string | null;
  planName?: string;
};

type DashboardRow = {
  id: string;
  title: string;
  published: boolean;
  clientName: string;
  clientId: string;
};

const CHART_COLORS = [
  "hsl(var(--chart-1, 173 58% 39%))",
  "hsl(var(--chart-2, 197 37% 24%))",
  "hsl(var(--chart-3, 43 74% 49%))",
  "hsl(var(--chart-4, 27 87% 55%))",
  "hsl(var(--chart-5, 280 65% 60%))",
];

export default function AdminOverviewPanel({ statsCounts }: { statsCounts: StatsCounts }) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientWithCounts[]>([]);
  const [allDashboards, setAllDashboards] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalClient, setModalClient] = useState<ClientWithCounts | null>(null);
  const [clientDashboards, setClientDashboards] = useState<DashboardRow[]>([]);
  const [loadingClientDashboards, setLoadingClientDashboards] = useState(false);
  const [modalAllDashboards, setModalAllDashboards] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: clientsData, error: clientsErr } = await supabase
        .from("clients")
        .select(
          `
          id,
          company_name,
          status,
          subscriptions ( plans ( name ) ),
          dashboard ( count ),
          etl ( count ),
          client_members ( count )
        `
        )
        .order("company_name", { ascending: true });

      if (clientsErr || !active) return;
      const mapped: ClientWithCounts[] = (clientsData ?? []).map((row: any) => ({
        id: row.id,
        company_name: row.company_name ?? "Sin nombre",
        dashboardsCount: row.dashboard?.[0]?.count ?? 0,
        etlsCount: row.etl?.[0]?.count ?? 0,
        membersCount: row.client_members?.[0]?.count ?? 0,
        status: row.status,
        planName: row.subscriptions?.[0]?.plans?.name ?? undefined,
      }));
      setClients(mapped);

      const { data: dashData, error: dashErr } = await supabase
        .from("dashboard")
        .select("id, title, published, client_id, clients(company_name)")
        .order("created_at", { ascending: false });

      if (!dashErr && dashData && active) {
        setAllDashboards(
          dashData.map((d: any) => ({
            id: d.id,
            title: d.title ?? "Sin título",
            published: !!d.published,
            clientName: d.clients?.company_name ?? "—",
            clientId: d.client_id ?? "",
          }))
        );
      }
      if (active) setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const openClientModal = async (client: ClientWithCounts) => {
    setModalClient(client);
    setLoadingClientDashboards(true);
    const dashboardsForClient = allDashboards.filter((d) => d.clientId === client.id);
    setClientDashboards(dashboardsForClient);
    setLoadingClientDashboards(false);
  };

  const barData = {
    labels: clients.slice(0, 8).map((c) => c.company_name.length > 18 ? c.company_name.slice(0, 18) + "…" : c.company_name),
    datasets: [
      {
        label: "Dashboards",
        data: clients.slice(0, 8).map((c) => c.dashboardsCount),
        backgroundColor: CHART_COLORS[0],
        borderRadius: 6,
      },
      {
        label: "ETLs",
        data: clients.slice(0, 8).map((c) => c.etlsCount),
        backgroundColor: CHART_COLORS[1],
        borderRadius: 6,
      },
    ],
  };

  const doughnutData = {
    labels: ["Dashboards", "ETLs", "Conexiones", "Clientes"],
    datasets: [
      {
        data: [
          statsCounts.dashboards,
          statsCounts.etls,
          statsCounts.connections,
          statsCounts.clients,
        ],
        backgroundColor: CHART_COLORS,
        borderWidth: 0,
      },
    ],
  };

  const publishedCount = allDashboards.filter((d) => d.published).length;
  const draftCount = allDashboards.length - publishedCount;

  return (
    <div className="flex flex-col w-full max-w-[1400px] mx-auto gap-8 pb-12">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl border px-8 py-10 sm:px-10 sm:py-12"
        style={{
          background: "linear-gradient(135deg, var(--platform-bg-elevated) 0%, var(--platform-surface) 100%)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
              Resumen de la plataforma
            </h1>
            <p className="mt-2 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
              Vista general de clientes, dashboards, ETLs y conexiones. Integrá datos, construí reportes y entregálos con branding propio.
            </p>
          </div>
          <Button
            onClick={() => router.push("/admin/dashboard/new")}
            className="rounded-xl font-medium gap-2 shrink-0"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            <Plus className="h-4 w-4" />
            Nuevo proyecto
          </Button>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: "dashboards", label: "Dashboards", value: statsCounts.dashboards, icon: LayoutDashboard, href: "/admin/dashboard" },
          { id: "clients", label: "Clientes", value: statsCounts.clients, icon: Users, href: "/admin/clients" },
          { id: "etls", label: "ETLs", value: statsCounts.etls, icon: Workflow, href: "/admin/etl" },
          { id: "connections", label: "Conexiones", value: statsCounts.connections, icon: Link2, href: "/admin/connections" },
        ].map(({ id, label, value, icon: Icon, href }) => (
          <Link key={id} href={href}>
            <div
              className="group flex items-center gap-4 rounded-2xl border p-5 transition-all hover:shadow-lg"
              style={{
                background: "var(--platform-surface)",
                borderColor: "var(--platform-border)",
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: "var(--platform-fg-muted)" }}>{label}</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--platform-fg)" }}>{value}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--platform-accent)" }} />
            </div>
          </Link>
        ))}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          className="rounded-2xl border p-6"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5" style={{ color: "var(--platform-accent)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Dashboards y ETLs por cliente</h2>
          </div>
          {loading ? (
            <div className="h-[240px] flex items-center justify-center" style={{ color: "var(--platform-fg-muted)" }}>
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="h-[240px]">
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "top" } },
                  scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 45, color: "var(--platform-fg-muted)", font: { size: 11 } } },
                    y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)" } },
                  },
                }}
              />
            </div>
          )}
        </div>
        <div
          className="rounded-2xl border p-6"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-5 w-5" style={{ color: "var(--platform-accent)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Distribución de la plataforma</h2>
          </div>
          <div className="h-[240px] flex items-center justify-center">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "right" } },
                cutout: "60%",
              }}
            />
          </div>
        </div>
      </section>

      {/* Clientes + Resumen dashboards */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border overflow-hidden" style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--platform-border)" }}>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: "var(--platform-accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Clientes</h2>
            </div>
            <Link href="/admin/clients" className="text-sm font-medium hover:underline" style={{ color: "var(--platform-accent)" }}>
              Ver todos
            </Link>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-8 flex justify-center" style={{ color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
                {clients.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openClientModal(c)}
                      className="w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[var(--platform-bg-elevated)]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" style={{ color: "var(--platform-fg)" }}>{c.company_name}</p>
                        <p className="text-sm mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                          {c.dashboardsCount} dashboard{c.dashboardsCount !== 1 ? "s" : ""} · {c.etlsCount} ETL{c.etlsCount !== 1 ? "s" : ""} · {c.membersCount} persona{c.membersCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--platform-fg-muted)" }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--platform-border)" }}>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" style={{ color: "var(--platform-accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Dashboards</h2>
            </div>
            <button
              type="button"
              onClick={() => setModalAllDashboards(true)}
              className="text-sm font-medium hover:underline"
              style={{ color: "var(--platform-accent)" }}
            >
              Ver todos
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Publicados</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: "var(--platform-success)" }}>{publishedCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Borradores</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: "var(--platform-warning)" }}>{draftCount}</span>
            </div>
            <Button
              onClick={() => setModalAllDashboards(true)}
              variant="outline"
              className="w-full rounded-xl gap-2"
              style={{ borderColor: "var(--platform-border)" }}
            >
              <ExternalLink className="h-4 w-4" />
              Ver listado completo
            </Button>
          </div>
        </div>
      </section>

      {/* Modal: Detalle cliente (dashboards del cliente) */}
      {modalClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setModalClient(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border shadow-xl overflow-hidden"
            style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>{modalClient.company_name}</h3>
              <button type="button" onClick={() => setModalClient(null)} className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)]" aria-label="Cerrar">
                <X className="h-5 w-5" style={{ color: "var(--platform-fg-muted)" }} />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
                {modalClient.dashboardsCount} dashboard{modalClient.dashboardsCount !== 1 ? "s" : ""} · {modalClient.etlsCount} ETL{modalClient.etlsCount !== 1 ? "s" : ""}
              </p>
              {loadingClientDashboards ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--platform-accent)" }} /></div>
              ) : clientDashboards.length === 0 ? (
                <p className="text-sm py-4" style={{ color: "var(--platform-fg-muted)" }}>Sin dashboards aún.</p>
              ) : (
                <ul className="space-y-2 max-h-[320px] overflow-y-auto">
                  {clientDashboards.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/admin/dashboard/${d.id}`}
                        className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-[var(--platform-bg-elevated)]"
                        style={{ borderColor: "var(--platform-border)" }}
                      >
                        <span className="font-medium truncate" style={{ color: "var(--platform-fg)" }}>{d.title}</span>
                        <span className="text-xs shrink-0 ml-2 px-2 py-0.5 rounded-full" style={{ background: d.published ? "var(--platform-success-dim)" : "var(--platform-surface-hover)", color: d.published ? "var(--platform-success)" : "var(--platform-fg-muted)" }}>
                          {d.published ? "Publicado" : "Borrador"}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 ml-2" style={{ color: "var(--platform-fg-muted)" }} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--platform-border)" }}>
              <Button variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setModalClient(null)}>Cerrar</Button>
              <Button className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }} onClick={() => { setModalClient(null); router.push(`/admin/clients/${modalClient.id}`); }}>
                Ir al cliente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Todos los dashboards */}
      {modalAllDashboards && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setModalAllDashboards(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-xl flex flex-col overflow-hidden"
            style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>Todos los dashboards</h3>
              <button type="button" onClick={() => setModalAllDashboards(false)} className="p-2 rounded-lg hover:bg-[var(--platform-surface-hover)]" aria-label="Cerrar">
                <X className="h-5 w-5" style={{ color: "var(--platform-fg-muted)" }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--platform-border)" }}>
                    <th className="text-left py-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Dashboard</th>
                    <th className="text-left py-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Cliente</th>
                    <th className="text-left py-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Estado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody style={{ color: "var(--platform-fg)" }}>
                  {allDashboards.map((d) => (
                    <tr key={d.id} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                      <td className="py-3 font-medium">{d.title}</td>
                      <td className="py-3" style={{ color: "var(--platform-fg-muted)" }}>{d.clientName}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: d.published ? "var(--platform-success-dim)" : "var(--platform-surface-hover)", color: d.published ? "var(--platform-success)" : "var(--platform-fg-muted)" }}>
                          {d.published ? "Publicado" : "Borrador"}
                        </span>
                      </td>
                      <td className="py-3">
                        <Link href={`/admin/dashboard/${d.id}`} className="inline-flex p-1.5 rounded-lg hover:bg-[var(--platform-bg-elevated)]" style={{ color: "var(--platform-accent)" }} aria-label="Abrir">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allDashboards.length === 0 && (
                <p className="py-8 text-center" style={{ color: "var(--platform-fg-muted)" }}>Aún no hay dashboards.</p>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end flex-shrink-0" style={{ borderColor: "var(--platform-border)" }}>
              <Button variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setModalAllDashboards(false)}>Cerrar</Button>
              <Button className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }} onClick={() => { setModalAllDashboards(false); router.push("/admin/dashboard"); }}>
                Ir a Dashboards
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
