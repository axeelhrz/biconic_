"use client";

import { Controller, UseFormRegister, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { usePlanOptions } from "@/hooks/usePlanOptions";
import { useLocationOptions } from "@/hooks/useLocationOptions";
import { useEffect } from "react";
import type { FieldErrors, FieldValues } from "react-hook-form";
import type { FormValues } from "@/app/admin/(main)/users/new/page";

export function FormEmpresa({
  register,
  errors,
}: {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const { control, setValue } = useFormContext<FormValues>() ?? ({} as any);
  const { options: planOptions, loading: loadingPlans } = usePlanOptions();
  const {
    countries,
    provinces,
    loadingCountries,
    loadingProvinces,
    fetchProvinces,
    setProvinces,
  } = useLocationOptions();

  // Watch country to fetch provinces if it changes externally or on mount
  const watchedCountry = useFormContext<FormValues>().watch("country");
  
  // Effect to load provinces if country is already selected (e.g. valid default)
  useEffect(() => {
    if (watchedCountry) {
        fetchProvinces(watchedCountry);
    } else {
        setProvinces([]);
    }
  }, [watchedCountry]);

  return (
    <>
      {/* --- DATOS DE LA EMPRESA --- */}
      
      {/* Fila 1: Identificación y Nombre */}
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Tipo de identificación">
          <Controller
            name="identificationType"
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={onChange}
                placeholder="Seleccione"
                options={[
                  { label: "DNI/Documento", value: "cc" },
                  { label: "CUIT/NIT", value: "nit" },
                  { label: "Pasaporte", value: "pasaporte" },
                ]}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        <Field label="Número de identificación">
          <Input
            placeholder="Ingrese"
            className="rounded-[25px]"
            {...register("identificationNumber")}
          />
        </Field>
        <Field label="Nombre de la empresa">
          <Input
            placeholder="Ingrese"
            className="rounded-[25px]"
            {...register("companyName")}
          />
        </Field>
      </div>

      {/* Fila 2: Ubicación */}
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="País">
          <Controller
            name="country"
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={(val: string) => {
                    onChange(val);
                    // Reset province when country changes
                    setValue("province", ""); 
                    fetchProvinces(val);
                }}
                placeholder="Seleccione"
                options={countries.map((c: any) => ({ label: c.name, value: c.id }))}
                disabled={loadingCountries}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        <Field label="Provincia">
          <Controller
            name="province"
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={onChange}
                placeholder="Seleccione"
                options={provinces.map((p: any) => ({ label: p.name, value: p.id }))}
                disabled={!watchedCountry || loadingProvinces}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        <Field label="Capital / Ciudad">
          <Input
             placeholder="Ingrese ciudad"
             className="rounded-[25px]"
             {...register("capital")}
          />
        </Field>
      </div>

      {/* Fila 3: Dirección y Contacto */}
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Dirección">
          <Input
            placeholder="Ingrese dirección física"
            className="rounded-[25px]"
            {...register("address")}
          />
        </Field>
        
        <Field
          label="Email corporativo (Contacto/Facturación)"
          error={(errors as FieldErrors<FieldValues>).email?.message as string}
        >
          <Input
            placeholder="ej: contabilidad@empresa.com"
            className="rounded-[25px]"
            type="email"
            {...register("email")}
          />
          <p className="pl-1 text-xs text-gray-500">Este email recibirá notificaciones, no es para login.</p>
        </Field>
      </div>

      {/* --- PLAN Y SUSCRIPCIÓN --- */}
      <div className="text-[18px] font-semibold text-[#00030A] mt-2">Plan y Suscripción</div>
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          label="Plan Comercial"
          error={(errors as FieldErrors<FieldValues>).planId?.message as string}
        >
          <Controller
            name="planId"
            rules={{ required: "El plan es requerido" }}
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={onChange}
                placeholder="Seleccione un plan"
                options={planOptions}
                disabled={loadingPlans}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        <Field label="Estado inicial">
          <Controller
            name="status"
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={onChange}
                placeholder="Seleccione"
                options={[
                  { label: "Activo", value: "activo" },
                  { label: "Inactivo", value: "inactivo" },
                ]}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
      </div>

      <hr className="my-4 border-gray-200" />

      {/* --- USUARIO ADMINISTRADOR --- */}
      <div className="text-[18px] font-semibold text-[#00030A]">
        Usuario Administrador (Acceso al sistema)
      </div>
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nombre del usuario">
          <Input
            placeholder="Nombre completo del admin"
            className="rounded-[25px]"
            {...register("userName", { required: "El nombre del usuario es requerido" })}
          />
        </Field>
        <Field label="Cargo">
          <Controller
            name="role"
            control={control}
            render={({ field: { value, onChange, name } }) => (
              <Select
                name={name}
                value={value as any}
                onChange={onChange}
                options={[
                  { label: "Ver", value: "ver" },
                  { label: "Editar", value: "editar" },
                  { label: "Admin", value: "admin" },
                ]}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        
        <Field 
          label="Email de acceso (Login)"
          error={(errors as FieldErrors<FieldValues>).userEmail?.message as string}
        >
          <Input
            placeholder="usuario@empresa.com"
            className="rounded-[25px]"
            type="email"
            {...register("userEmail", { required: "El email de acceso es requerido" })}
          />
        </Field>
        
        <Field 
          label="Contraseña"
          error={(errors as FieldErrors<FieldValues>).userPassword?.message as string}
        >
          <PasswordInput
            placeholder="Digite la contraseña"
            className="rounded-[25px] border-[#D9DCE3]"
            {...register("userPassword", { required: "La contraseña es requerida" })}
          />
        </Field>
      </div>
    </>
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
      <label className="text-[14px] font-medium text-[#66687E]">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}