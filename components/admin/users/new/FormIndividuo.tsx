"use client";

import { Controller, UseFormRegister, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { useCompanyOptions } from "@/hooks/useCompanyOptions";
import { useLocationOptions } from "@/hooks/useLocationOptions";
import { usePlanOptions } from "@/hooks/usePlanOptions";
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
  const { control, setValue, watch } = useFormContext<FormValues>() ?? ({} as any);
  const { options: companyOptions, loading: loadingCompanies } =
    useCompanyOptions();
  const { options: planOptions, loading: loadingPlans } = usePlanOptions();
  const companyId = watch("companyId");

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
                style={{ color: "var(--platform-fg)" }}
              />
            )}
          />
        </Field>
        <Field label="Número de identificación">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("identificationNumber")}
          />
        </Field>
        <Field label="Nombre del cliente">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
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
                    setValue("province", "");
                    fetchProvinces(val);
                }}
                placeholder="Seleccione"
                options={countries.map((c: any) => ({ label: c.name, value: c.id }))}
                disabled={loadingCountries}
                className="w-full rounded-xl"
                style={{ color: "var(--platform-fg)" }}
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
                style={{ color: "var(--platform-fg)" }}
              />
            )}
          />
        </Field>
        <Field label="Capital / Ciudad">
          <Input
            placeholder="Ingrese ciudad"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("capital")}
          />
        </Field>
      </div>

      <div className="w-full">
        <Field label="Dirección">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("address")}
          />
        </Field>
      </div>

      {!companyId ? (
        <>
          <div className="text-lg font-semibold mt-2 mb-1" style={{ color: "var(--platform-fg)" }}>
            Plan y Suscripción
          </div>
          <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Plan Comercial (opcional)"
              error={(errors as FieldErrors<FieldValues>).planId?.message as string}
            >
              <Controller
                name="planId"
                control={control}
                render={({ field: { value, onChange, name } }) => (
                  <Select
                    name={name}
                    value={value as any}
                    onChange={onChange}
                    placeholder="Sin plan asignado"
                    options={planOptions}
                    disabled={loadingPlans}
                    className="w-full rounded-xl"
                    style={{ color: "var(--platform-fg)" }}
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
                    className="w-full rounded-xl"
                    style={{ color: "var(--platform-fg)" }}
                  />
                )}
              />
            </Field>
          </div>
        </>
      ) : null}

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
                style={{ color: "var(--platform-fg)" }}
              />
            )}
          />
        </Field>
        <Field label="Email" error={errors.userEmail?.message as string}>
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
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
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("userPassword", {
              required: "La contraseña es requerida",
            })}
          />
        </Field>
      </div>

      {/* Si elige empresa existente, solo se agrega como miembro (sin plan nuevo). */}

      <hr className="my-6" style={{ borderColor: "var(--platform-border)" }} />
    </>
  );
}
