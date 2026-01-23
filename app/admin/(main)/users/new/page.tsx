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
    <div className="box-border mx-auto flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border border-[#ECECEC] bg-[#FDFDFD] px-10 py-8">
      <FormProvider {...methods}>
        {/* Header */}
        <div className="flex w-full flex-col gap-1">
          <h1 className="font-exo2 text-[28px] font-semibold leading-none text-[#00030A]">
            Crear cliente
          </h1>
          <p className="text-sm text-[#54565B]">
            Crea cliente empresa o cliente individuo
          </p>
        </div>

        {/* Tipo de cliente */}
        <div className="flex w-full flex-col gap-3">
          <div className="text-sm font-medium text-[#66687E]">
            Tipo de cliente
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="empresa"
                {...register("clientType")}
                className="h-4 w-4 accent-[#02B8D1]"
              />
              <span className="text-[16px] text-[#282828]">Empresa</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="individuo"
                {...register("clientType")}
                className="h-4 w-4 accent-[#02B8D1]"
              />
              <span className="text-[16px] text-[#282828]">Individuo</span>
            </label>
          </div>
        </div>

        {/* Formulario por tipo */}
        {clientType === "empresa" ? (
          <FormEmpresa errors={errors} register={register} />
        ) : (
          <FormIndividuo errors={errors} register={register} />
        )}

        {/* Footer acciones */}
        <div className="flex w-full items-center justify-end gap-6">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-[150px] rounded-full border-[#0F5F4C] text-[#0F5F4C]"
            onClick={() => router.push("/admin/users")}
          >
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="h-10 w-[150px] rounded-full bg-[#0F5F4C] hover:opacity-90"
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
      <Label className="text-[14px] font-medium text-[#66687E]">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}