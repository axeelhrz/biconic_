import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardStudio } from "@/components/admin/dashboard/AdminDashboardStudio";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";
import { ArrowLeft } from "lucide-react";

import "../admin-dashboard-editor.css";
import "../studio.css";
import "./admin-dashboard-view.css";

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
  const etlInfo = dashboard?.etl as { id: string; title?: string; name?: string } | null;
  const etlName = etlInfo?.title || etlInfo?.name || null;
  const createdAt = (dashboard as { created_at?: string })?.created_at ?? null;

  return (
    <div className="admin-view-page w-full">
      <div className="admin-view-page__accent" aria-hidden />
      <div className="admin-view-preview-bar">
        <span className="admin-view-preview-bar__label">Vista previa</span>
        <Link
          href={`/admin/dashboard/${dashboardId}`}
          className="admin-view-preview-bar__link"
        >
          <ArrowLeft className="admin-view-preview-bar__icon" />
          Editar dashboard
        </Link>
      </div>
      <div className="studio-page flex min-h-[calc(100vh-4rem)] min-w-0 flex-col flex-1 w-full">
        <AdminDashboardStudio
          dashboardId={dashboardId}
          title={title}
          etlName={etlName}
          createdAt={createdAt}
          embeddedPreview
        />
      </div>
    </div>
  );
}
