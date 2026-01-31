import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Play, Settings, Eye, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardEditor } from "@/components/admin/dashboard/AdminDashboardEditor";
import { DashboardHeaderDetails } from "@/components/admin/dashboard/DashboardHeaderDetails";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";

import "./admin-dashboard-editor.css";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminDashboardByIdPage({ params }: PageProps) {
  const awaitedParams = await params;
  const dashboardId = awaitedParams["id"];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    const role = (prof as any)?.app_role as
      | import("@/lib/supabase/database.types").Database["public"]["Enums"]["app_role"]
      | null;
    if (role !== "APP_ADMIN") {
      redirect("/dashboard");
    }
  } else {
    redirect("/auth/login");
  }

  const { data: dashboard, error } = await supabase
    .from("dashboard")
    .select(
      `
      *,
      etl:etl_id (
        id,
        title,
        name
      )
    `
    )
    .eq("id", dashboardId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching dashboard (Admin):", error.message);
  }

  if (user?.id) {
    const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
    if (!canEdit) {
      redirect("/dashboard");
    }
  }

  const title = (dashboard && (dashboard as any).title) || dashboardId;
  const etlInfo = dashboard?.etl;
  const etlName = etlInfo?.title || etlInfo?.name || null;

  return (
    <div className="admin-dashboard-editor-page flex flex-col w-full h-[calc(100vh-2rem)] gap-4">
      {/* Barra: Admin > Dashboards > Editor + título + acciones — limpia, sin ruido */}
      <header className="admin-editor-page-header flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <nav className="flex items-center gap-1.5" aria-label="Navegación">
            <Link href="/admin">Admin</Link>
            <ChevronRight className="w-4 h-4 opacity-50" />
            <Link href="/admin/dashboard">Dashboards</Link>
            <ChevronRight className="w-4 h-4 opacity-50" />
            <span className="text-neutral-600">Editor</span>
          </nav>
          <div className="admin-editor-page-title">
            <DashboardHeaderDetails
              dashboardId={dashboardId}
              title={title}
              etlName={etlName}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild className="rounded-[10px] border-[rgba(0,0,0,0.08)]">
            <Link href={`/admin/dashboard/${dashboardId}/view`}>
              <Eye className="w-4 h-4 mr-1.5" />
              Ver vista
            </Link>
          </Button>
          <Button size="sm" className="rounded-[10px] bg-neutral-800 hover:bg-neutral-700 text-white">
            <Play className="w-4 h-4 mr-1.5" />
            Ejecutar
          </Button>
          <Button variant="ghost" size="icon" className="rounded-[10px] h-9 w-9 text-neutral-500 hover:text-neutral-700" title="Configuración">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Editor: área a pantalla completa; paneles como drawers */}
      <div className="admin-editor-wrap flex-1 min-h-0 flex flex-col overflow-hidden relative">
        <AdminDashboardEditor dashboardId={dashboardId} />
      </div>
    </div>
  );
}
