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
    <div className="flex w-full flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
        {label}
      </label>
      {children}
      {error ? <p className="text-xs" style={{ color: "var(--platform-danger)" }}>{error}</p> : null}
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
                className="w-full rounded-xl"
              />
            )}
          />
        </Field>
        <Field label="Número de identificación">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
            {...register("identificationNumber")}
          />
        </Field>
        <Field label="Nombre del cliente">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
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
                className="w-full rounded-xl"
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
                className="w-full rounded-xl"
              />
            )}
          />
        </Field>
        <Field label="Capital / Ciudad">
          <Input
            placeholder="Ingrese ciudad"
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
            {...register("capital")}
          />
        </Field>
      </div>

      {/* Dirección */}
      <div className="w-full">
        <Field label="Dirección">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
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
                className="w-full rounded-xl"
              />
            )}
          />
        </Field>
        <Field label="Email" error={errors.userEmail?.message as string}>
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
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
            className="rounded-xl border h-11"
            style={{ borderColor: "var(--platform-border)" }}
            {...register("userPassword", {
              required: "La contraseña es requerida",
            })}
          />
        </Field>
      </div>

      {/* Plan, Límites y Permisos no aplican para Individuo que se une a empresa. Puedes ocultarlos condicionalmente si quieres. */}

      <hr className="my-6" style={{ borderColor: "var(--platform-border)" }} />
    </>
  );
}
