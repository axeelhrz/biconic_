"use client";

import { usePathname } from "next/navigation";
import ViewerDashboardHeader from "@/components/viewer/dashboard/ViewerDashboardHeader";
import ViewerBottomNav from "@/components/viewer/dashboard/ViewerBottomNav";

function isViewerDashboardViewRoute(pathname: string | null): boolean {
  return /^\/viewer\/dashboard\/[^/]+\/view\/?$/.test(pathname ?? "");
}

export default function ViewerLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboardView = isViewerDashboardViewRoute(pathname);

  return (
    <>
      {!isDashboardView ? <ViewerDashboardHeader /> : null}
      <main
        className={`flex w-full flex-col ${
          isDashboardView
            ? "h-dvh min-h-0 overflow-hidden"
            : "min-h-dvh flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0"
        }`}
        style={{ background: "var(--platform-bg)" }}
      >
        <div
          className={`flex w-full flex-col ${
            isDashboardView ? "h-full min-h-0" : "flex-1 items-center"
          }`}
        >
          <div
            className={`w-full ${
              isDashboardView
                ? "h-full min-h-0 max-w-none"
                : "mx-auto flex max-w-[1400px] flex-1 flex-col px-4 sm:px-6"
            }`}
          >
            {children}
          </div>
        </div>
      </main>
      {!isDashboardView ? <ViewerBottomNav /> : null}
    </>
  );
}
