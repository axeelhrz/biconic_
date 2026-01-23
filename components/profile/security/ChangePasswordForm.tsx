"use client";

import { useState } from "react";
import { toast } from "sonner";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ChangePasswordForm({
  onSuccess,
  onCancel,
}: ChangePasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const validate = () => {
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setSubmitting(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        throw userError || new Error("No hay sesión activa");

      // Actualiza la contraseña
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      // Opcional: forzar sign-in refresh
      toast.success("Contraseña actualizada correctamente");
      toast.success("Contraseña actualizada correctamente");
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo actualizar la contraseña");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-start p-[30px] gap-[20px] bg-white rounded-[20px] w-[618px]"
    >
      {/* Header */}
      <div className="flex flex-row justify-between items-start w-full gap-[15px]">
        <h2 className="font-exo2 font-bold text-[28px] leading-[34px] text-[#035664] mx-auto">
          Cambiar contraseña
        </h2>
      </div>

      {/* Campos */}
      <div className="flex flex-col gap-5 w-full">
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={setPassword}
          shown={showPassword}
          onToggle={() => setShowPassword((s) => !s)}
          name="new-password"
        />
        <PasswordField
          label="Confirmar contraseña"
          value={confirmPassword}
          onChange={setConfirmPassword}
          shown={showConfirmPassword}
          onToggle={() => setShowConfirmPassword((s) => !s)}
          name="confirm-password"
        />
      </div>

      {/* Botones */}
      <div className="flex flex-row justify-end items-center gap-[23px] w-full pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex flex-row items-center justify-center gap-2 px-5 py-2.5 h-10 border-[1.5px] border-[#0F5F4C] rounded-full text-[#0F5F4C] font-poppins text-[15px] font-medium leading-5 hover:bg-[#0F5F4C]/10 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={clsx(
            "flex flex-row items-center justify-center gap-3 h-10 px-5 rounded-full bg-[#0F5F4C] text-white font-poppins text-[15px] font-medium leading-5 transition-colors disabled:opacity-60",
            submitting && "cursor-not-allowed"
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
          {submitting ? "Guardando..." : "Guardar cambios"}
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
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  shown: boolean;
  onToggle: () => void;
  name: string;
}

function PasswordField({
  label,
  value,
  onChange,
  shown,
  onToggle,
  name,
}: PasswordFieldProps) {
  return (
    <div className="flex flex-col gap-[6px] w-full">
      <label className="font-poppins text-[14px] font-medium leading-4 text-[#66687E]">
        {label}
      </label>
      <div className="flex flex-row items-center w-full h-10 border border-[#D9DCE3] rounded-[25px] bg-white overflow-hidden">
        <div className="flex items-center justify-center w-10 h-10 border-r border-[#D9DCE3]">
          {/* Lock Icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="#9C9EA9"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6.75 10.5h10.5a2.25 2.25 0 0 1 2.25 2.25v6a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 18.75v-6a2.25 2.25 0 0 1 2.25-2.25Z"
            />
          </svg>
        </div>
        <input
          name={name}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-full px-4 font-poppins text-[16px] leading-5 text-[#282828] bg-white placeholder:text-[#9C9EA9] focus:outline-none"
          placeholder="***************"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center w-10 h-10 border-l border-[#D9DCE3] text-[#9C9EA9] hover:text-[#035664] transition-colors"
        >
          {shown ? (
            // Eye slash icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
          ) : (
            // Eye icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
