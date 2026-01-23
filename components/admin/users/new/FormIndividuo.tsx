"use client";

import { Controller, UseFormRegister, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { useCompanyOptions } from "@/hooks/useCompanyOptions";
import { useLocationOptions } from "@/hooks/useLocationOptions";
import { useEffect } from "react";
import type { FieldErrors, FieldValues } from "react-hook-form";
import type { FormValues } from "@/app/admin/(main)/users/new/page";

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

export function FormIndividuo({
  register,
  errors,
}: {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const { control, setValue } = useFormContext<FormValues>() ?? ({} as any);
  const { options: companyOptions, loading: loadingCompanies } =
    useCompanyOptions();

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
      {/* Fila 1 */}
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Tipo de identificación">
          <Controller
            name="identificationType"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
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
        <Field label="Nombre del cliente">
          <Input
            placeholder="Ingrese"
            className="rounded-[25px]"
            {...register("individualFullName")}
          />
        </Field>
      </div>

      {/* Fila 2 */}
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

      {/* Dirección */}
      <div className="w-full">
        <Field label="Dirección">
          <Input
            placeholder="Ingrese"
            className="rounded-[25px]"
            {...register("address")}
          />
        </Field>
      </div>

      {/* Empresa a la cual pertenece + Email + Password */}
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Empresa a la cual pertenece">
          <Controller
            name="companyId"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                placeholder="Seleccione"
                options={companyOptions}
                disabled={loadingCompanies}
                className="rounded-[25px]"
              />
            )}
          />
        </Field>
        <Field label="Email" error={errors.userEmail?.message as string}>
          <Input
            placeholder="Ingrese"
            className="rounded-[25px]"
            type="email"
            {...register("userEmail", { required: "El email es requerido" })}
          />
        </Field>
        <Field
          label="Contraseña"
          error={errors.userPassword?.message as string}
        >
          <PasswordInput
            placeholder="Digite la contraseña"
            className="rounded-[25px] border-[#D9DCE3]"
            {...register("userPassword", {
              required: "La contraseña es requerida",
            })}
          />
        </Field>
      </div>

      {/* Plan, Límites y Permisos no aplican para Individuo que se une a empresa. Puedes ocultarlos condicionalmente si quieres. */}

      <hr className="my-2" />
    </>
  );
}
