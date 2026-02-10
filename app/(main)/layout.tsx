// En ProtectedLayout.js
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DashboardHeader />
      <main className="flex flex-col items-center min-h-screen overflow-hidden" style={{ background: "var(--platform-bg)" }}>
        <div className="flex-1 w-full flex flex-col items-center overflow-hidden">
          <div className="biconic-platform-content flex-1 flex flex-col w-full max-w-[1400px] overflow-hidden">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
