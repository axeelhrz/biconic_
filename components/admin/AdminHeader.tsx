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
          (_event, _session) => {
            if (mounted) {
              setIsUserLoading(true);
              loadUser();
            }
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
    <header className="box-border flex items-center justify-between w-full max-w-[1390px] h-14 px-16 py-2.5 mx-auto my-4 bg-[#FDFDFD] border border-[#ECECEC] rounded-full">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-3 text-2xl font-bold italic text-[#00030A] no-underline"
      >
        <div className="relative w-[42px] h-5 bg-gradient-to-r from-[#23E3B4] via-[#40EF8E] to-[#02B8D1] rounded-[10px]">
          {/* Círculo blanco que estaba en el pseudo-elemento ::after */}
          <div className="absolute top-1/2 left-5 w-3.5 h-3.5 bg-[#FDFDFD] rounded-full -translate-y-1/2"></div>
        </div>
        <span>biconic</span>
      </Link>

      {/* Navegación */}
      <nav className="flex items-center gap-5">
        {navLinks.map((link) => {
          const baseClasses =
            "px-4 py-2 text-sm font-normal rounded-full transition-colors duration-300 flex items-center gap-1 cursor-pointer";
          const activeClasses =
            "text-white bg-gradient-to-b from-[#191B24] via-[#242D34] to-[#225659]";
          const inactiveClasses = "text-[#00030A] hover:bg-gray-100";

          // Handle Dropdown
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
                <DropdownMenuContent align="end" className="bg-white rounded-xl shadow-lg border border-gray-100 p-2 min-w-[200px]">
                  {link.children.map((child) => (
                    <DropdownMenuItem key={child.href} asChild>
                      <Link
                        href={child.href}
                        className={`w-full cursor-pointer rounded-lg px-3 py-2 text-sm ${
                          pathname === child.href ? "bg-gray-50 font-medium text-[#047183]" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {child.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          // Handle Regular Link
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

      {/* Perfil de Usuario */}
      <div className="flex items-center gap-2.5">
        {isLoading ? (
          <div className="animate-pulse flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            <div className="flex flex-col gap-1.5">
              <div className="w-24 h-4 bg-gray-200 rounded"></div>
              <div className="w-16 h-3 bg-gray-200 rounded"></div>
            </div>
          </div>
        ) : userName ? (
          <>
            <Link
              href="/profile"
              className="flex items-center gap-2.5 no-underline"
            >
              <Image
                className="rounded-full object-cover"
                src={avatarUrl || "/switch.svg"}
                alt={`Avatar de ${userName}`}
                width={32}
                height={32}
              />
              <div className="flex flex-col">
                <span className="text-base font-medium leading-5 text-[#00030A]">
                  {userName}
                </span>
                <span className="text-sm font-medium leading-4 text-[#54565B]">
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
              <span className="text-base font-medium leading-5 text-[#00030A]">
                <Link href="/auth/login" className="underline">
                  Iniciar sesión
                </Link>
              </span>
              <span className="text-sm font-medium leading-4 text-[#54565B]">
                Invitado
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}