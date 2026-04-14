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
    <div
      className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto border rounded-[30px] gap-8"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-[var(--platform-fg)]">
          Panel general
        </h1>
        <p className="mt-2 text-sm text-[var(--platform-fg-muted)]">
          {userName ? (
            <>
              Hola, <span className="font-medium text-[var(--platform-fg)]">{userName}</span>.
              Aquí ves el resumen de tu espacio en Biconic.
            </>
          ) : (
            "Resumen de tu espacio en Biconic."
          )}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--platform-surface)]" />
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--platform-surface)]" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--platform-danger)]/40 bg-[var(--platform-danger)]/10 p-4 text-sm text-[var(--platform-danger)]">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[var(--platform-fg-muted)] text-sm font-medium">
                <LayoutDashboard className="h-4 w-4" />
                Dashboards accesibles
              </div>
              <p className="mt-2 text-3xl font-semibold text-[var(--platform-fg)]">
                {totalCount}
              </p>
              <p className="mt-1 text-xs text-[var(--platform-muted)]">
                {publishedCount} publicado{publishedCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[var(--platform-fg-muted)] text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Empresa{companies.length !== 1 ? "s" : ""}
              </div>
              <p className="mt-2 text-3xl font-semibold text-[var(--platform-fg)]">
                {companies.length}
              </p>
              <p className="mt-1 text-xs text-[var(--platform-muted)]">
                {companies.length === 0
                  ? "Sin empresa asignada; contacta a tu administrador."
                  : "Asignadas al crear tu usuario."}
              </p>
            </div>
          </div>

          {companies.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--platform-fg)] mb-3">
                Tu organización
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {companies.map((c) => (
                  <li
                    key={c.clientId}
                    className="flex items-start gap-3 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
                  >
                    <Building2 className="h-5 w-5 text-[var(--platform-accent)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--platform-fg)]">{c.name}</p>
                      {c.memberRole ? (
                        <p className="text-xs text-[var(--platform-fg-muted)] mt-0.5 capitalize">
                          Rol en cliente: {c.memberRole}
                        </p>
                      ) : null}
                      <Link
                        href={`/viewer/dashboard?client=${encodeURIComponent(c.clientId)}`}
                        className="mt-2 inline-block text-xs font-medium text-[var(--platform-accent)] no-underline hover:underline"
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
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-[var(--platform-accent-fg)] bg-[var(--platform-accent)] no-underline"
            >
              Ir a mis dashboards
            </Link>
            <Link
              href="/viewer/profile"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--platform-border)] px-5 py-2.5 text-sm font-medium text-[var(--platform-fg)] bg-[var(--platform-surface)] no-underline hover:bg-[var(--platform-surface-hover)]"
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
