import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardViewer } from "@/components/dashboard/DashboardViewer";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";

import "./admin-dashboard-view.css";
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

  return (
    <div className="admin-view-page">
      <div className="admin-view-page__accent" aria-hidden />
      <main className="admin-view-page__main">
        <div className="admin-view-page__container">
          <DashboardViewer
            dashboardId={dashboardId}
            variant="default"
            backHref={`/admin/dashboard/${dashboardId}`}
            backLabel="Editar dashboard"
          />
        </div>
      </main>
    </div>
  );
}
