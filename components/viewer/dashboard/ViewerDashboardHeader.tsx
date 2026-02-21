"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { useUserRole } from "@/hooks/useUserRole";

const navLinks = [{ href: "/viewer/dashboard", label: "Dashboards" }];

export default function ViewerDashboardHeader() {
  const pathname = usePathname();
  const [userName, setUserName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
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
    }
    loadUser();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      setIsUserLoading(true);
      loadUser();
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const isLoading = isUserLoading || isRoleLoading;

  return (
    <header className="box-border flex items-center justify-between w-full max-w-[1390px] h-14 px-16 py-2.5 mx-auto my-4 bg-[#FDFDFD] border border-[#ECECEC] rounded-full">
      <Link
        href="/"
        className="flex items-center gap-3 text-2xl font-bold italic text-[#00030A] no-underline"
      >
        <div className="relative w-[42px] h-5 bg-gradient-to-r from-[#23E3B4] via-[#40EF8E] to-[#02B8D1] rounded-[10px]">
          <div className="absolute top-1/2 left-5 w-3.5 h-3.5 bg-[#FDFDFD] rounded-full -translate-y-1/2" />
        </div>
        <span>biconic</span>
      </Link>
      <nav className="flex items-center gap-5">
        {navLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
          const base =
            "px-4 py-2 text-sm font-normal rounded-full transition-colors duration-300";
          const active =
            "text-white bg-gradient-to-b from-[#191B24] via-[#242D34] to-[#225659]";
          const inactive = "text-[#00030A]";
          return (
            <Link
              key={link.label}
              href={link.href}
              className={`${base} ${isActive ? active : inactive}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5">
        {isLoading ? (
          <div className="animate-pulse flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-200 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <div className="w-24 h-4 bg-gray-200 rounded" />
              <div className="w-16 h-3 bg-gray-200 rounded" />
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
