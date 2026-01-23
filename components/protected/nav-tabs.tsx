"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
};

export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center gap-2 rounded-full bg-gray-100 p-1">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || (pathname?.startsWith(tab.href) && tab.href !== "/");
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`px-4 py-2 text-sm rounded-full ${
              active ? "bg-white shadow text-gray-900" : "text-gray-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
