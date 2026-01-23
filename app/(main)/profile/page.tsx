import { Suspense } from "react";
import DashboardsSection from "@/components/dashboard/DashboardSection";
import ProfileSection from "@/components/profile/ProfileSection";

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <ProfileSection />
      </Suspense>
    </>
  );
}
