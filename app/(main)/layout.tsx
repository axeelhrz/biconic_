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
