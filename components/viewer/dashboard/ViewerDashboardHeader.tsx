"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { useUserRole } from "@/hooks/useUserRole";

const navLinks = [
  { href: "/viewer", label: "Panel", match: "exact" as const },
  { href: "/viewer/dashboard", label: "Dashboards", match: "prefix" as const },
  { href: "/viewer/profile", label: "Perfil", match: "prefix" as const },
];

function appRoleLabel(appRole: string | null): string {
  if (appRole === "VIEWER") return "Usuario";
  if (appRole === "CREATOR") return "Creador";
  if (appRole === "APP_ADMIN") return "Administrador";
  return appRole ?? "Usuario";
}

function isActive(pathname: string, href: string, match: "exact" | "prefix"): boolean {
  if (match === "exact") {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname.startsWith(href);
}

export default function ViewerDashboardHeader() {
  const pathname = usePathname() ?? "";
  const [userName, setUserName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const { role: userRole, loading: isRoleLoading } = useUserRole();

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setUserName(null);
        setAvatarUrl(null);
        setIsUserLoading(false);
        return;
      }
      const user = data.user;
      if (user) {
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.user_metadata?.username ||
          user.email ||
          "Usuario";
        setUserName(name);
        const picture =
          (user.user_metadata as { avatar_url?: string; picture?: string; avatar?: string })
            ?.avatar_url ||
          (user.user_metadata as { picture?: string })?.picture ||
          (user.user_metadata as { avatar?: string })?.avatar ||
          null;
        setAvatarUrl(typeof picture === "string" ? picture : null);
      } else {
        setUserName(null);
        setAvatarUrl(null);
      }
      setIsUserLoading(false);
    }
    loadUser();
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "TOKEN_REFRESHED") return;
      setIsUserLoading(true);
      loadUser();
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isLoading = isUserLoading || isRoleLoading;

  return (
    <>
      <header
        className="sticky top-0 z-40 mx-auto my-3 box-border flex w-full max-w-[1390px] items-center justify-between rounded-full border px-4 py-2 sm:my-4 sm:h-14 sm:px-6 md:px-10 lg:px-16"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
        }}
      >
        <Link
          href="/viewer"
          className="flex items-center gap-2 text-xl font-bold italic no-underline sm:gap-3 sm:text-2xl"
          style={{ color: "var(--platform-fg)" }}
        >
          <div className="relative h-4 w-9 rounded-[10px] bg-gradient-to-r from-[#23E3B4] via-[#40EF8E] to-[#02B8D1] sm:h-5 sm:w-[42px]">
            <div
              className="absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full sm:left-5 sm:h-3.5 sm:w-3.5"
              style={{ background: "var(--platform-surface)" }}
            />
          </div>
          <span>biconic</span>
        </Link>

        <nav className="hidden items-center gap-3 md:flex lg:gap-5">
          {navLinks.map((link) => {
            const active = isActive(pathname, link.href, link.match);
            const base =
              "px-4 py-2 text-sm font-normal rounded-full transition-colors duration-300";
            const activeClass =
              "text-[var(--platform-accent-fg)] bg-[var(--platform-accent)]";
            const inactiveClass =
              "text-[var(--platform-fg-muted)] hover:text-[var(--platform-fg)]";
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`${base} ${active ? activeClass : inactiveClass}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          {isLoading ? (
            <div className="flex animate-pulse items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[var(--platform-surface-hover)]" />
              <div className="flex flex-col gap-1.5">
                <div className="h-4 w-24 rounded bg-[var(--platform-surface-hover)]" />
                <div className="h-3 w-16 rounded bg-[var(--platform-surface-hover)]" />
              </div>
            </div>
          ) : userName ? (
            <>
              <Link
                href="/viewer/profile"
                className="flex items-center gap-2.5 no-underline"
              >
                <Image
                  className="rounded-full object-cover"
                  src={avatarUrl || "/switch.svg"}
                  alt={`Avatar de ${userName}`}
                  width={32}
                  height={32}
                />
                <div className="hidden flex-col lg:flex">
                  <span
                    className="text-base font-medium leading-5"
                    style={{ color: "var(--platform-fg)" }}
                  >
                    {userName}
                  </span>
                  <span
                    className="text-sm font-medium leading-4"
                    style={{ color: "var(--platform-fg-muted)" }}
                  >
                    {appRoleLabel(userRole)}
                  </span>
                </div>
              </Link>
              <div className="ml-1">
                <LogoutButton />
              </div>
            </>
          ) : (
            <>
              <Image
                className="rounded-full object-cover"
                src={avatarUrl || "/switch.svg"}
                alt="Avatar anónimo"
                width={32}
                height={32}
              />
              <div className="flex flex-col">
                <span
                  className="text-base font-medium leading-5"
                  style={{ color: "var(--platform-fg)" }}
                >
                  <Link href="/auth/login" className="underline">
                    Iniciar sesión
                  </Link>
                </span>
                <span
                  className="text-sm font-medium leading-4"
                  style={{ color: "var(--platform-fg-muted)" }}
                >
                  Invitado
                </span>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          style={{
            borderColor: "var(--platform-border)",
            color: "var(--platform-fg)",
          }}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute right-0 top-0 flex h-full w-[min(100%,20rem)] flex-col gap-6 border-l p-5 shadow-xl"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--platform-fg)" }}
              >
                Menú
              </span>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                style={{ color: "var(--platform-fg-muted)" }}
                aria-label="Cerrar menú"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => {
                const active = isActive(pathname, link.href, link.match);
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`rounded-xl px-4 py-3 text-sm font-medium no-underline ${
                      active
                        ? "bg-[var(--platform-accent)] text-[var(--platform-accent-fg)]"
                        : "text-[var(--platform-fg)] hover:bg-[var(--platform-surface-hover)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div
              className="mt-auto flex flex-col gap-4 border-t pt-4"
              style={{ borderColor: "var(--platform-border)" }}
            >
              {isLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-[var(--platform-surface-hover)]" />
              ) : userName ? (
                <>
                  <Link
                    href="/viewer/profile"
                    className="flex items-center gap-3 no-underline"
                  >
                    <Image
                      className="rounded-full object-cover"
                      src={avatarUrl || "/switch.svg"}
                      alt={`Avatar de ${userName}`}
                      width={40}
                      height={40}
                    />
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--platform-fg)" }}
                      >
                        {userName}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--platform-fg-muted)" }}
                      >
                        {appRoleLabel(userRole)}
                      </p>
                    </div>
                  </Link>
                  <LogoutButton />
                </>
              ) : (
                <Link
                  href="/auth/login"
                  className="text-sm font-medium underline"
                  style={{ color: "var(--platform-accent)" }}
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
