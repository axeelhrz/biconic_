// En AdminLayout.js
import AdminHeader from "@/components/admin/AdminHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminHeader />
      <main className="min-h-screen flex flex-col items-center bg-[#F4F6FA]">
        <div className="flex-1 w-full flex flex-col items-center">
          <div className="flex-1 flex flex-col gap-10 w-full max-w-[1400px]">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
