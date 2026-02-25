"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createNewClient } from "@/actions/createClient";
import { addClientMember } from "@/actions/addClientMember";
import { FormEmpresa } from "@/components/admin/users/new/FormEmpresa";
import { FormIndividuo } from "@/components/admin/users/new/FormIndividuo";

type ClientType = "empresa" | "individuo";

export type FormValues = {
  clientType: ClientType;
  companyName?: string;
  companyId?: string; // empresa a la cual pertenece (individuo)
  individualFullName?: string;
  identificationType?: string;
  identificationNumber?: string;
  country?: string;
  province?: string;
  capital?: string;
  address?: string;
  email: string;
  password: string;
  planId?: string;
  status?: "activo" | "inactivo";
  maxUsers?: number;
  maxProjects?: number;
  userName?: string;
  role?: "ver" | "editar" | "admin";
  userEmail?: string;
  userPassword?: string;
};

export default function NewUserPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const methods = useForm<FormValues>({
    defaultValues: {
      clientType: "empresa",
      role: "ver",
      status: "activo",
      identificationType: "",
      identificationNumber: "",
      country: "",
      province: "",
      capital: "",
      planId: "",
      companyId: "",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = methods;

  const clientType = watch("clientType");

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      // Si es individuo y trae companyId, agregamos miembro a cliente existente.
      const isAddMember =
        values.clientType === "individuo" && !!values.companyId;
      const res = isAddMember
        ? await addClientMember({
            existingClientId: values.companyId!,
            userEmail: values.userEmail ?? values.email,
            userPassword: values.userPassword ?? values.password,
            userFullName: values.individualFullName ?? values.userName,
            userJobTitle: values.role,
          })
        : await createNewClient({
            clientType: values.clientType,
            companyName: values.companyName,
            individualFullName: values.individualFullName,
            identificationType: values.identificationType,
            identificationNumber: values.identificationNumber,
            country: values.country,
            province: values.province,
            capital: values.capital,
            address: values.address,
            planId: values.planId,
            status: values.status,
            maxUsers: values.maxUsers,
            maxProjects: values.maxProjects,
            userName: values.userName,
            userJobTitle: values.role,
            role: values.role,
            userEmail: values.userEmail ?? values.email,
            userPassword: values.userPassword ?? values.password,
            email: values.email,
            password: values.password,
          });

      if (!res.ok) {
        // Show detailed error if available
        const errorMsg = res.error ?? "No se pudo crear el usuario";
        const errorDetails = (res as any).details; // Cast to access new property if not inferred
        
        toast.error(errorMsg, {
          description: errorDetails || undefined,
          duration: 5000,
        });
        return;
      }
      toast.success(
        isAddMember
          ? "Miembro añadido correctamente"
          : "Cliente creado correctamente"
      );
      router.push("/admin/users");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el usuario");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div
      className="rounded-3xl border px-6 py-8 sm:px-8 sm:py-10 flex flex-col gap-6 max-w-3xl mx-auto"
      style={{
        background: "var(--platform-surface)",
        borderColor: "var(--platform-border)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
      }}
    >
      <FormProvider {...methods}>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
            Crear cliente
          </h1>
          <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            Creá cliente empresa o cliente individuo
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
            Tipo de cliente
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" value="empresa" {...register("clientType")} className="h-4 w-4" style={{ accentColor: "var(--platform-accent)" }} />
              <span className="text-base" style={{ color: "var(--platform-fg)" }}>Empresa</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" value="individuo" {...register("clientType")} className="h-4 w-4" style={{ accentColor: "var(--platform-accent)" }} />
              <span className="text-base" style={{ color: "var(--platform-fg)" }}>Individuo</span>
            </label>
          </div>
        </div>
        {clientType === "empresa" ? (
          <FormEmpresa errors={errors} register={register} />
        ) : (
          <FormIndividuo errors={errors} register={register} />
        )}
        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl px-6"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            onClick={() => router.push("/admin/users")}
          >
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="h-10 rounded-xl px-6"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            {submitting ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </FormProvider>
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>{label}</Label>
      {children}
      {error ? <p className="text-xs" style={{ color: "var(--platform-danger)" }}>{error}</p> : null}
    </div>
  );
}