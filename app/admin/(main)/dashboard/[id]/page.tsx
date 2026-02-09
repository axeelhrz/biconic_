import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardStudio } from "@/components/admin/dashboard/AdminDashboardStudio";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";

import "./admin-dashboard-editor.css";
import "./studio.css";

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
    const role = (prof as { app_role?: string })?.app_role as
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
    console.error("Error fetching dashboard (Admin):", error.message);
  }

  if (user?.id) {
    const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
    if (!canEdit) {
      redirect("/dashboard");
    }
  }

  const title = (dashboard && (dashboard as { title?: string }).title) || dashboardId;
  const etlInfo = dashboard?.etl as { id: string; title?: string; name?: string } | null;
  const etlName = etlInfo?.title || etlInfo?.name || null;
  const createdAt = (dashboard as { created_at?: string })?.created_at ?? null;

  return (
    <div className="studio-page flex min-h-[calc(100vh-4rem)] flex-col w-full flex-1">
      <AdminDashboardStudio
        dashboardId={dashboardId}
        title={title}
        etlName={etlName}
        createdAt={createdAt}
      />
    </div>
  );
}
