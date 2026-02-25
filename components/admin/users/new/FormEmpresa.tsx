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

  const watchedCountry = useFormContext<FormValues>().watch("country");

  useEffect(() => {
    if (watchedCountry) {
      fetchProvinces(watchedCountry);
    } else {
      setProvinces([]);
    }
  }, [watchedCountry]);

  return (
    <>
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Tipo de identificación" error={(errors as FieldErrors<FieldValues>).identificationType?.message as string}>
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
        <Field label="Nombre de la empresa">
          <Input
            placeholder="Ingrese"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("companyName")}
          />
        </Field>
      </div>

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

      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Dirección">
          <Input
            placeholder="Ingrese dirección física"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            {...register("address")}
          />
        </Field>
        <Field
          label="Email corporativo (Contacto/Facturación)"
          error={(errors as FieldErrors<FieldValues>).email?.message as string}
        >
          <Input
            placeholder="ej: contabilidad@empresa.com"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
            type="email"
            {...register("email")}
          />
          <p className="mt-1 pl-0 text-xs" style={{ color: "var(--platform-fg-muted)" }}>
            Este email recibirá notificaciones, no es para login.
          </p>
        </Field>
      </div>

      <div className="text-lg font-semibold mt-6 mb-1" style={{ color: "var(--platform-fg)" }}>
        Plan y Suscripción
      </div>
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

      <hr className="my-6" style={{ borderColor: "var(--platform-border)" }} />

      <div className="text-lg font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
        Usuario Administrador (Acceso al sistema)
      </div>
      <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Nombre del usuario" error={(errors as FieldErrors<FieldValues>).userName?.message as string}>
          <Input
            placeholder="Nombre completo del admin"
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
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
                className="w-full rounded-xl"
                style={{ color: "var(--platform-fg)" }}
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
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
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
            className="rounded-xl border h-11 placeholder:opacity-70"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg)",
            }}
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
    <div className="flex w-full flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs" style={{ color: "var(--platform-danger)" }}>{error}</p>
      ) : null}
    </div>
  );
}