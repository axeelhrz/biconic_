"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid, User } from "lucide-react";

const navItems = [
  { href: "/viewer", label: "Panel", icon: LayoutDashboard, match: "exact" as const },
  { href: "/viewer/dashboard", label: "Dashboards", icon: LayoutGrid, match: "prefix" as const },
  { href: "/viewer/profile", label: "Perfil", icon: User, match: "prefix" as const },
];

function isActive(pathname: string, href: string, match: "exact" | "prefix"): boolean {
  if (match === "exact") {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname.startsWith(href);
}

export default function ViewerBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t md:hidden"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium no-underline transition-colors ${
                active
                  ? "text-[var(--platform-accent)]"
                  : "text-[var(--platform-fg-muted)]"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
