// En ProtectedLayout.js
import { ThemeSwitcher } from "@/components/theme-switcher";
import Image from "next/image";
import Link from "next/link";
import { NavTabs } from "@/components/protected/nav-tabs";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center bg-[#F4F6FA]">
      <div className="flex-1 w-full flex flex-col items-center">
        <DashboardHeader />
        <div className="flex-1 flex flex-col gap-10 w-full max-w-[1400px] px-5 py-6">
          {children}
        </div>
      </div>
    </main>
  );
}
