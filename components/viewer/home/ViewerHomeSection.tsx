"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useViewerAccessibleDashboards } from "@/hooks/useViewerAccessibleDashboards";
import { LayoutDashboard, UserCircle, Building2 } from "lucide-react";

export default function ViewerHomeSection() {
  const {
    companies,
    loading,
    error,
    totalCount,
    publishedCount,
  } = useViewerAccessibleDashboards();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const u = data.user;
      if (u) {
        const name =
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.user_metadata?.username ||
          u.email ||
          null;
        setUserName(name);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#00030A]">
          Panel general
        </h1>
        <p className="mt-2 text-sm text-[#54565B]">
          {userName ? (
            <>
              Hola, <span className="font-medium text-[#00030A]">{userName}</span>.
              Aquí ves el resumen de tu espacio en Biconic.
            </>
          ) : (
            "Resumen de tu espacio en Biconic."
          )}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[#54565B] text-sm font-medium">
                <LayoutDashboard className="h-4 w-4" />
                Dashboards accesibles
              </div>
              <p className="mt-2 text-3xl font-semibold text-[#00030A]">
                {totalCount}
              </p>
              <p className="mt-1 text-xs text-[#777]">
                {publishedCount} publicado{publishedCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[#54565B] text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Empresa{companies.length !== 1 ? "s" : ""}
              </div>
              <p className="mt-2 text-3xl font-semibold text-[#00030A]">
                {companies.length}
              </p>
              <p className="mt-1 text-xs text-[#777]">
                {companies.length === 0
                  ? "Sin empresa asignada; contacta a tu administrador."
                  : "Asignadas al crear tu usuario."}
              </p>
            </div>
          </div>

          {companies.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[#00030A] mb-3">
                Tu organización
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {companies.map((c) => (
                  <li
                    key={c.clientId}
                    className="flex items-start gap-3 rounded-xl border border-[#ECECEC] bg-white p-4"
                  >
                    <Building2 className="h-5 w-5 text-[#225659] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#00030A]">{c.name}</p>
                      {c.memberRole ? (
                        <p className="text-xs text-[#54565B] mt-0.5 capitalize">
                          Rol en cliente: {c.memberRole}
                        </p>
                      ) : null}
                      <Link
                        href={`/viewer/dashboard?client=${encodeURIComponent(c.clientId)}`}
                        className="mt-2 inline-block text-xs font-medium text-[#225659] no-underline hover:underline"
                      >
                        Ver dashboards de {c.name}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/viewer/dashboard"
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-b from-[#191B24] via-[#242D34] to-[#225659] no-underline"
            >
              Ir a mis dashboards
            </Link>
            <Link
              href="/viewer/profile"
              className="inline-flex items-center gap-2 rounded-full border border-[#ECECEC] px-5 py-2.5 text-sm font-medium text-[#00030A] bg-white no-underline hover:bg-[#F4F6FA]"
            >
              <UserCircle className="h-4 w-4" />
              Mi perfil
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
