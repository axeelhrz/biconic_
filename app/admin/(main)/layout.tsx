import AdminHeader from "@/components/admin/AdminHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminHeader />
      <main className="min-h-screen flex flex-col items-center" style={{ background: "var(--platform-bg)" }}>
        <div className="flex-1 w-full flex flex-col items-center px-4 sm:px-6">
          <div className="biconic-platform-content flex-1 flex flex-col gap-5 w-full max-w-[1680px] py-5">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
