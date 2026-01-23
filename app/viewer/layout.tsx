import ViewerDashboardHeader from "@/components/viewer/dashboard/ViewerDashboardHeader";
import React from "react";

export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware ya protege el acceso por rol VIEWER.
  return (
    <>
      <ViewerDashboardHeader />
      <main className="flex flex-col items-center bg-[#F4F6FA] overflow-hidden">
        <div className="flex-1 w-full flex flex-col items-center overflow-hidden">
          <div className="flex-1 flex flex-col w-full max-w-[1400px] overflow-hidden">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
