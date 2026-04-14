"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Building2 } from "lucide-react";
import type { ViewerCompanySummary } from "@/hooks/useViewerAccessibleDashboards";

function appRoleLabel(appRole: string | null): string {
  if (appRole === "VIEWER") return "Usuario";
  if (appRole === "CREATOR") return "Creador";
  if (appRole === "APP_ADMIN") return "Administrador";
  return appRole ?? "—";
}

function clientDisplayName(row: {
  company_name?: string | null;
  individual_full_name?: string | null;
  type?: string | null;
}): string {
  if (row.type === "empresa" && row.company_name?.trim()) {
    return row.company_name.trim();
  }
  if (row.individual_full_name?.trim()) {
    return row.individual_full_name.trim();
  }
  return row.company_name?.trim() || "Cliente";
}

export default function ViewerProfileSection() {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [appRole, setAppRole] = useState<string | null>(null);
  const [companies, setCompanies] = useState<ViewerCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!mounted) return;
        const user = auth.user;
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, job_title, app_role")
          .eq("id", user.id)
          .single();

        const { data: cmData } = await supabase
          .from("client_members")
          .select(
            `
            client_id,
            role,
            clients (
              company_name,
              individual_full_name,
              type
            )
          `
          )
          .eq("user_id", user.id)
          .eq("is_active", true);

        if (!mounted) return;

        setEmail(profile?.email ?? user.email ?? null);
        setFullName(
          profile?.full_name ??
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined) ??
            null
        );
        setJobTitle(profile?.job_title ?? null);
        setAppRole(profile?.app_role ?? null);

        const memberships = (cmData ?? []) as Array<{
          client_id: string;
          role: string | null;
          clients: {
            company_name?: string | null;
            individual_full_name?: string | null;
            type?: string | null;
          } | null;
        }>;
        setCompanies(
          memberships.map((m) => ({
            clientId: String(m.client_id),
            name: m.clients ? clientDisplayName(m.clients) : "Cliente",
            memberRole: m.role,
          }))
        );
      } catch (error) {
        console.error("Failed to load profile:", error);
        if (mounted) {
          setCompanies([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div
      className="flex flex-col box-border w-full max-w-[800px] px-10 py-8 mx-auto border rounded-[30px] gap-6"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <h1 className="text-2xl font-semibold text-[var(--platform-fg)]">Mi perfil</h1>
      <p className="text-sm text-[var(--platform-fg-muted)]">
        Datos de tu cuenta y de la organización a la que perteneces.
      </p>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 w-48 rounded bg-[var(--platform-surface)]" />
          <div className="h-4 w-64 rounded bg-[var(--platform-surface)]" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-sm text-[var(--platform-fg)]">
            <p>
              <span className="font-medium">Email:</span> {email ?? "—"}
            </p>
            <p>
              <span className="font-medium">Nombre:</span> {fullName ?? "—"}
            </p>
            {jobTitle ? (
              <p>
                <span className="font-medium">Cargo:</span> {jobTitle}
              </p>
            ) : null}
            <p>
              <span className="font-medium">Rol en la plataforma:</span>{" "}
              {appRoleLabel(appRole)}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[var(--platform-fg)] mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Empresa{companies.length !== 1 ? "s" : ""}
            </h2>
            {companies.length === 0 ? (
              <p className="text-sm text-[var(--platform-fg-muted)]">
                No hay empresa vinculada. Si deberías ver una organización aquí,
                contacta al administrador.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {companies.map((c) => (
                  <li
                    key={c.clientId}
                    className="rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-[var(--platform-fg)]">{c.name}</span>
                    {c.memberRole ? (
                      <span className="block text-xs text-[var(--platform-fg-muted)] mt-1 capitalize">
                        Rol en cliente: {c.memberRole}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
