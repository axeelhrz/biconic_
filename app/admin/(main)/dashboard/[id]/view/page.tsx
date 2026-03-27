import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardViewer from "@/components/dashboard/DashboardViewer";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";
import { ArrowLeft } from "lucide-react";

import "./client-dashboard-view.css";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminDashboardViewPage({ params }: PageProps) {
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

  if (!user?.id) redirect("/auth/login");
  const canView = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canView) {
    redirect("/dashboard");
  }

  const { data: dashboard, error } = await supabase
    .from("dashboard")
    .select(
      `
      id,
      title,
      created_at,
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
    console.error("Error fetching dashboard (Admin view):", error.message);
  }

  const title = (dashboard && (dashboard as { title?: string }).title) || dashboardId;

  return (
    <div className="admin-view-page flex w-full min-h-0 flex-1 flex-col">
      <div className="admin-view-page__accent" aria-hidden />
      <div className="admin-view-preview-bar">
        <div className="admin-view-preview-bar__left flex min-w-0 items-center gap-3">
          <span className="admin-view-preview-bar__label shrink-0">Vista previa</span>
          <span className="admin-view-preview-bar__title truncate font-medium text-white/90" title={title}>
            {title}
          </span>
        </div>
        <Link
          href={`/admin/dashboard/${dashboardId}`}
          className="admin-view-preview-bar__link shrink-0"
        >
          <ArrowLeft className="admin-view-preview-bar__icon" />
          Editar dashboard
        </Link>
      </div>
      <div className="admin-view-page__main flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardViewer dashboardId={dashboardId} hideHeader />
      </div>
    </div>
  );
}
