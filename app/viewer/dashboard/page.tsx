import { Suspense } from "react";
import ViewerDashboardsSection from "@/components/viewer/dashboard/ViewerDashboardsSection";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ViewerDashboardsSection />
    </Suspense>
  );
}
