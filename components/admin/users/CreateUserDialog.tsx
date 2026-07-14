"use client";

import { useState } from "react";
import { Plus, Loader2, User, Mail, Lock, Shield, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { useCompanyOptions } from "@/hooks/useCompanyOptions";
import { CLIENT_ROLE_OPTIONS } from "@/lib/admin/client-role-options";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createAdminUser } from "@/app/admin/(main)/users/actions";
import type { Database } from "@/lib/supabase/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];
type ClientRole = Database["public"]["Enums"]["client_role"];

const ROLE_HINTS: Record<AppRole, string> = {
  VIEWER: "Solo puede ver dashboards asignados. Ideal para clientes finales.",
  CREATOR: "Puede crear ETLs, conexiones y dashboards en su espacio de trabajo.",
  APP_ADMIN: "Acceso total al panel de administración y gestión de la plataforma.",
};

const inputClassName =
  "h-11 w-full rounded-xl border px-4 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)] placeholder:text-[var(--platform-muted)]";

const inputStyle: React.CSSProperties = {
  background: "var(--platform-bg-elevated)",
  borderColor: "var(--platform-border-strong)",
  color: "var(--platform-fg)",
};

interface Props {
  onCreated?: () => void;
}

function FormField({
  id,
  label,
  hint,
  required,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--platform-border)",
        background: "var(--platform-bg-elevated)",
      }}
    >
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "var(--platform-accent-dim)",
            color: "var(--platform-accent)",
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={id}
            className="block text-sm font-semibold"
            style={{ color: "var(--platform-fg)" }}
          >
            {label}
            {required ? (
              <span className="ml-1" style={{ color: "var(--platform-accent)" }}>
                *
              </span>
            ) : (
              <span
                className="ml-2 text-xs font-normal"
                style={{ color: "var(--platform-fg-muted)" }}
              >
                (opcional)
              </span>
            )}
          </label>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--platform-fg-muted)" }}>
            {hint}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CreateUserDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appRole, setAppRole] = useState<AppRole>("VIEWER");
  const [clientId, setClientId] = useState("");
  const [clientRole, setClientRole] = useState<ClientRole>("viewer");
  const { options: companyOptions, loading: loadingCompanies } = useCompanyOptions();

  const reset = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setAppRole("VIEWER");
    setClientId("");
    setClientRole("viewer");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email y contraseña son obligatorios");
      return;
    }
    setSubmitting(true);
    const res = await createAdminUser({
      email: email.trim(),
      password,
      fullName: fullName.trim() || undefined,
      appRole,
      clientId: clientId || undefined,
      clientRole: clientId ? clientRole : undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear el usuario");
      return;
    }
    toast.success("Usuario creado correctamente");
    setOpen(false);
    reset();
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="shrink-0 rounded-xl font-semibold gap-2 h-12 px-6 shadow-lg hover:shadow-xl transition-all"
          style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
        >
          <Plus className="h-5 w-5" />
          Agregar usuario
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[520px] gap-0 p-0 overflow-hidden"
        style={{
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border-strong)",
        }}
      >
        <form onSubmit={handleSubmit}>
          <div
            className="border-b px-6 py-5"
            style={{
              borderColor: "var(--platform-border)",
              background:
                "linear-gradient(135deg, var(--platform-bg-elevated) 0%, var(--platform-surface) 100%)",
            }}
          >
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-xl font-bold" style={{ color: "var(--platform-fg)" }}>
                Nuevo usuario
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed" style={{ color: "var(--platform-fg-muted)" }}>
                Completá los datos de acceso. El usuario podrá iniciar sesión con el correo y la contraseña que definas acá.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-4 px-6 py-5">
            <FormField
              id="user-full-name"
              label="Nombre completo"
              hint="Nombre que se mostrará en el perfil y en el encabezado de la plataforma."
              icon={User}
            >
              <input
                id="user-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej: María García"
                className={inputClassName}
                style={inputStyle}
                autoComplete="name"
              />
            </FormField>

            <FormField
              id="user-email"
              label="Correo electrónico"
              hint="Será el identificador de inicio de sesión. Debe ser único en la plataforma."
              required
              icon={Mail}
            >
              <input
                id="user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className={inputClassName}
                style={inputStyle}
                autoComplete="email"
              />
            </FormField>

            <FormField
              id="user-password"
              label="Contraseña"
              hint="Contraseña inicial del usuario. Mínimo 6 caracteres."
              required
              icon={Lock}
            >
              <input
                id="user-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={inputClassName}
                style={inputStyle}
                autoComplete="new-password"
              />
            </FormField>

            <FormField
              id="user-company"
              label="Empresa"
              hint="Cliente al que pertenece el usuario. Podés asignarla ahora o más tarde desde el detalle del cliente."
              icon={Building2}
            >
              <Select
                value={clientId}
                onChange={(v: string) => setClientId(v)}
                placeholder={loadingCompanies ? "Cargando empresas…" : "Sin empresa asignada"}
                options={[
                  { label: "Sin empresa", value: "" },
                  ...companyOptions,
                ]}
                buttonClassName="h-11 rounded-xl w-full justify-between px-4 text-sm font-medium border"
                disablePortal
              />
            </FormField>

            {clientId ? (
              <FormField
                id="user-client-role"
                label="Rol en la empresa"
                hint="Permisos del usuario dentro del espacio de trabajo del cliente."
                icon={Shield}
              >
                <Select
                  value={clientRole}
                  onChange={(v: string) => setClientRole(v as ClientRole)}
                  options={CLIENT_ROLE_OPTIONS}
                  buttonClassName="h-11 rounded-xl w-full justify-between px-4 text-sm font-medium border"
                  disablePortal
                />
              </FormField>
            ) : null}

            <FormField
              id="user-role"
              label="Rol de plataforma"
              hint="Define qué secciones y permisos tendrá el usuario dentro de Biconic."
              icon={Shield}
            >
              <Select
                value={appRole}
                onChange={(v: any) => setAppRole(v as AppRole)}
                options={[
                  { label: "Viewer — solo lectura", value: "VIEWER" },
                  { label: "Creator — creación de contenido", value: "CREATOR" },
                  { label: "App Admin — administración total", value: "APP_ADMIN" },
                ]}
                buttonClassName="h-11 rounded-xl w-full justify-between px-4 text-sm font-medium border"
                disablePortal
              />
              <p
                className="mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{
                  color: "var(--platform-fg-muted)",
                  background: "var(--platform-surface)",
                  border: "1px solid var(--platform-border)",
                }}
              >
                {ROLE_HINTS[appRole]}
              </p>
            </FormField>
          </div>

          <DialogFooter
            className="gap-3 border-t px-6 py-4 sm:justify-end"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}
          >
            <Button
              type="button"
              variant="outline"
              className="rounded-xl h-11 px-5"
              style={{ borderColor: "var(--platform-border-strong)", color: "var(--platform-fg)" }}
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="rounded-xl h-11 gap-2 px-6 font-semibold"
              style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
