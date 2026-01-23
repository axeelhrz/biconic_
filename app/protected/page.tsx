import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Search, Eye, MoreHorizontal } from "lucide-react";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");

  // Demo data for the dashboard cards
  const dashboards = Array.from({ length: 12 }).map((_, i) => ({
    id: i + 1,
    title: "Ventas DHL",
    status: "Publicado",
    views: 1254,
    thumb: "/images/dashboard-thumb.png",
  }));

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      {/* Top bar moved to layout */}

      {/* Title and filters */}
      <div>
        <h1 className="text-3xl text-black font-bold">Dashboards</h1>
        <p className="text-black">Gestiona y edita tus dashboards</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            placeholder="Buscar"
            className="w-full rounded-full border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: "Todos", active: true },
            { label: "Publicados", active: false },
            { label: "Borradores", active: false },
          ].map((f) => (
            <button
              key={f.label}
              className={`rounded-full px-3 py-1.5 text-sm ${f.active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Dashboards totales", value: 6, highlight: true },
          { title: "Publicados", value: 3 },
          { title: "Vistas promedio", value: 518 },
          { title: "Widgets promedio", value: 7 },
        ].map((kpi, i) => (
          <div
            key={kpi.title}
            className={`rounded-2xl p-4 ${
              kpi.highlight
                ? "bg-gradient-to-br from-gray-900 to-gray-700 text-white"
                : "bg-white border"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className={`text-sm ${kpi.highlight ? "text-white/80" : "text-gray-500"}`}>{kpi.title}</h3>
              <div className={`h-8 w-8 rounded-full ${kpi.highlight ? "bg-white/10" : "bg-emerald-50"}`} />
            </div>
            <div className={`text-3xl font-bold mt-2 ${kpi.highlight ? "text-white" : "text-gray-900"}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Grid of dashboard cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {dashboards.map((d) => (
          <div key={d.id} className="rounded-xl border bg-white overflow-hidden">
            <div className="aspect-[16/10] bg-gray-100">
              {/* Thumbnail placeholder; replace with real screenshot */}
              <Image src={d.thumb} alt={d.title} width={640} height={400} className="w-full h-full object-cover" />
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-2">
                    <span className="text-lg font-semibold">{d.title}</span>
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{d.status}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Análisis completo de ventas del primer trimestre</p>
                </div>
                <button className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-gray-100">
                  <MoreHorizontal className="h-4 w-4 text-gray-600" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {d.views}</span>
                <span>12:54</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
