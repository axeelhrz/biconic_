"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { useUserRole } from "@/hooks/useUserRole";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const navLinks = [
  { href: "/admin", label: "Panel general" },
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/etl", label: "ETL" },
  { href: "/admin/metrics", label: "Métricas" },
  { href: "/admin/monitors", label: "Monitores" },
  { href: "/admin/connections", label: "Conexiones" },
  {
    label: "Gestión",
    children: [
      { href: "/admin/users", label: "Gestión de usuarios" },
      { href: "/admin/clients", label: "Gestión de clientes" },
      { href: "/admin/plans", label: "Gestión de planes" },
    ],
  },
];

export default function AdminHeader() {
  const pathname = usePathname();
  const [userName, setUserName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);

  // 2. LLAMAR AL HOOK PARA OBTENER EL ROL Y SU ESTADO DE CARGA
  const { role: userRole, loading: isRoleLoading } = useUserRole();

  useEffect(() => {
    // Dynamically import createClient to avoid issues during prerendering
    const loadUser = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
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
            (user.user_metadata as any)?.avatar_url ||
            (user.user_metadata as any)?.picture ||
            (user.user_metadata as any)?.avatar ||
            null;
          setAvatarUrl(typeof picture === "string" ? picture : null);
        } else {
          setUserName(null);
          setAvatarUrl(null);
        }
        setIsUserLoading(false);
      } catch (error) {
        // Handle any errors during client creation or auth check
        setUserName(null);
        setAvatarUrl(null);
        setIsUserLoading(false);
      }
    };

    let mounted = true;
    loadUser();

    // Setup auth state listener
    const setupAuthListener = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: sub } = supabase.auth.onAuthStateChange(
          (event, _session) => {
            if (!mounted) return;
            // No recargar al volver a la pestaña (TOKEN_REFRESHED); solo en cambio real de sesión
            if (event === "TOKEN_REFRESHED") return;
            setIsUserLoading(true);
            loadUser();
          }
        );

        return () => {
          sub?.subscription?.unsubscribe?.();
        };
      } catch (error) {
        // Handle any errors during setup
        return () => {};
      }
    };

    let unsubscribe: (() => void) | null = null;
    setupAuthListener().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const isLoading = isUserLoading || isRoleLoading;

  return (
    <header
      className="box-border flex items-center justify-between w-full max-w-[1390px] h-14 px-16 py-2.5 mx-auto my-4 rounded-full border transition-colors"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      {/* Logo Biconic: verde + cian */}
      <Link
        href="/"
        className="flex items-center gap-3 text-2xl font-bold italic no-underline"
        style={{ color: "var(--platform-fg)" }}
      >
        <div className="relative w-[42px] h-5 bg-gradient-to-r from-[#23E3B4] via-[#40EF8E] to-[#08CDEF] rounded-[10px]">
          <div className="absolute top-1/2 left-5 w-3.5 h-3.5 rounded-full -translate-y-1/2 bg-[#00030A]"></div>
        </div>
        <span>biconic</span>
      </Link>

      {/* Navegación */}
      <nav className="flex items-center gap-5">
        {navLinks.map((link) => {
          const baseClasses =
            "px-4 py-2 text-sm font-normal rounded-full transition-colors duration-300 flex items-center gap-1 cursor-pointer";
          const activeClasses =
            "text-[var(--platform-accent-fg)] font-medium bg-[var(--platform-accent)] hover:opacity-90";
          const inactiveClasses =
            "text-[var(--platform-fg-muted)] hover:text-[var(--platform-accent)] hover:bg-[var(--platform-accent-dim)]";

          if (link.children) {
            const isChildActive = link.children.some((child) =>
              pathname.startsWith(child.href)
            );
            return (
              <DropdownMenu key={link.label}>
                <DropdownMenuTrigger
                  className={`${baseClasses} ${
                    isChildActive ? activeClasses : inactiveClasses
                  } outline-none border-none`}
                >
                  {link.label}
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="rounded-xl shadow-xl border p-2 min-w-[200px]"
                  style={{
                    background: "var(--platform-surface)",
                    borderColor: "var(--platform-border)",
                  }}
                >
                  {link.children.map((child) => (
                    <DropdownMenuItem key={child.href} asChild>
                      <Link
                        href={child.href}
                        className={`w-full cursor-pointer rounded-lg px-3 py-2 text-sm ${
                          pathname === child.href
                            ? "font-medium"
                            : "hover:opacity-90"
                        }`}
                        style={{
                          color: pathname === child.href ? "var(--platform-accent)" : "var(--platform-fg)",
                          background: pathname === child.href ? "var(--platform-accent-dim)" : "transparent",
                        }}
                      >
                        {child.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          const isActive =
            link.href === "/admin"
              ? pathname === link.href
              : pathname.startsWith(link.href!);

          return (
            <Link
              key={link.label}
              href={link.href!}
              className={`${baseClasses} ${
                isActive ? activeClasses : inactiveClasses
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Perfil */}
      <div className="flex items-center gap-2.5">
        {isLoading ? (
          <div className="animate-pulse flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full"
              style={{ background: "var(--platform-surface-hover)" }}
            />
            <div className="flex flex-col gap-1.5">
              <div
                className="w-24 h-4 rounded"
                style={{ background: "var(--platform-surface-hover)" }}
              />
              <div
                className="w-16 h-3 rounded"
                style={{ background: "var(--platform-surface-hover)" }}
              />
            </div>
          </div>
        ) : userName ? (
          <>
            <Link href="/profile" className="flex items-center gap-2.5 no-underline">
              <Image
                className="rounded-full object-cover"
                src={avatarUrl || "/switch.svg"}
                alt={`Avatar de ${userName}`}
                width={32}
                height={32}
              />
              <div className="flex flex-col">
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
                  {userRole ?? "Usuario"}
                </span>
              </div>
            </Link>
            <div className="ml-3">
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
                <Link href="/auth/login" className="underline hover:text-[var(--platform-accent)]">
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
    </header>
  );
}