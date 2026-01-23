"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

type FormValues = {
  name: string;
  email: string;
};

interface EditProfileFormProps {
  // Optional external callbacks; the component will handle Supabase update internally
  onSubmit?: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
  onSuccess?: () => void; // called after successful DB update
}

export default function EditProfileForm({
  onSubmit,
  onCancel,
  onSuccess,
}: EditProfileFormProps) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      email: "",
    },
    mode: "onBlur",
  });

  const [submitting, setSubmitting] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const supabase = createClient();

  // Load current user profile to prefill form
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoadingUser(false);
          return;
        }
        // fetch profile row
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", user.id)
          .single();
        if (error && error.code !== "PGRST116") {
          console.error("Error fetching profile:", error);
        }
        if (active && profile) {
          form.reset({
            name: profile.full_name || "",
            email: profile.email || user.email || "",
          });
        } else if (active && user) {
          form.reset({
            name: "",
            email: user.email || "",
          });
        }
      } finally {
        active && setLoadingUser(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, form]);

  const handleSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);
      // get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No user");

      // Upsert (insert or update) la fila del perfil. Quitamos updated_at porque no existe en el esquema dado.
      const profilePayload = {
        id: user.id, // necesario para upsert
        full_name: values.name,
        email: values.email,
      } as const;

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (upsertError) throw upsertError;

      // Optionally also update auth user email if changed & different
      if (values.email && values.email !== user.email) {
        const { error: authUpdateError } = await supabase.auth.updateUser({
          email: values.email,
        });
        if (authUpdateError) {
          // Non-fatal; just log
          console.warn("Auth email update failed:", authUpdateError);
        }
      }

      if (onSubmit) await onSubmit(values); // external hook if provided

      toast.success("Perfil actualizado correctamente");
      onSuccess?.();
    } catch (error: any) {
      console.error("Profile save error", error);
      toast.error(
        error?.message === "No user"
          ? "No hay usuario autenticado"
          : "No se pudo actualizar el perfil"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-start p-[30px] gap-[20px] bg-white rounded-[20px] w-[618px]">
      <div className="flex flex-row justify-between items-start w-full">
        <h2 className="font-exo2 font-bold text-2xl text-[#035664]">
          Editar perfil
        </h2>
      </div>
      <h3 className="font-exo2 font-semibold text-xl text-[#00030A]">
        Información general
      </h3>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="w-full space-y-5"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#66687E]">
            Nombre administrador
          </label>
          <Input
            {...form.register("name", { required: "El nombre es requerido" })}
            placeholder="Maria Espitia"
            disabled={loadingUser || submitting}
          />
          {form.formState.errors.name && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#66687E]">Email</label>
          <Input
            type="email"
            {...form.register("email", {
              required: "El email es requerido",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "El email no es válido",
              },
            })}
            placeholder="maria.espitia@dominio.com"
            disabled={loadingUser || submitting}
          />
          {form.formState.errors.email && (
            <p className="text-red-500 text-xs">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-4 w-full pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-row items-center justify-center gap-2 px-5 py-2.5 h-10 border-[1.5px] border-[#0F5F4C] rounded-full text-[#0F5F4C] font-poppins text-[15px] font-medium leading-5 hover:bg-[#0F5F4C]/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || loadingUser}
            className={clsx(
              "flex flex-row items-center justify-center gap-3 h-10 px-5 rounded-full bg-[#0F5F4C] text-white font-poppins text-[15px] font-medium leading-5 transition-colors disabled:opacity-60",
              (submitting || loadingUser) && "cursor-not-allowed"
            )}
          >
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-[17.5px] bg-[#66F2A5]">
              {/* Save Icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M5 5v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.828a2 2 0 0 0-.586-1.414l-2.828-2.828A2 2 0 0 0 14.172 3H7a2 2 0 0 0-2 2z" />
                <path d="M15 20v-6a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v6" />
                <path d="M5 9h14" />
              </svg>
            </span>
            {loadingUser
              ? "Cargando..."
              : submitting
              ? "Guardando..."
              : "Guardar cambios"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
