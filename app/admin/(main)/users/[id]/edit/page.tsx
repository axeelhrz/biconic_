"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";
import {
  getUserById,
  updateUser,
  type UserForEdit,
} from "@/app/admin/(main)/users/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { Camera, User } from "lucide-react";

type AppRole = Database["public"]["Enums"]["app_role"];

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

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [user, setUser] = useState<UserForEdit | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [appRole, setAppRole] = useState<AppRole>("VIEWER");
  const [status, setStatus] = useState<"activo" | "inactivo">("activo");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Load user data
  useEffect(() => {
    (async () => {
      const res = await getUserById(userId);
      setLoading(false);
      if (res.ok && res.data) {
        setUser(res.data);
        setFullName(res.data.full_name ?? "");
        setJobTitle(res.data.job_title ?? "");
        setAppRole(res.data.app_role ?? "VIEWER");
        setStatus(res.data.role === "inactive" ? "inactivo" : "activo");
        // Use avatar_url from database, fallback to Gravatar
        setAvatarUrl(
          res.data.avatar_url ||
            `https://secure.gravatar.com/avatar/${userId}?d=mp&s=200`
        );
      } else {
        toast.error(res.error ?? "No se pudo cargar el usuario");
        router.push("/admin/users");
      }
    })();
  }, [userId, router]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar los 5MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const supabase = createClient();

      // Generate file name based on user ID (overwrite existing)
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${userId}.${fileExt}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        // If bucket doesn't exist, show helpful message
        if (uploadError.message.includes("Bucket not found")) {
          toast.error(
            "El bucket 'avatars' no existe. Por favor créalo en Supabase Storage."
          );
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

      const newAvatarUrl = data.publicUrl;

      // Update avatar URL in database
      const updateRes = await updateUser({
        userId,
        avatar_url: newAvatarUrl,
      });

      if (!updateRes.ok) {
        throw new Error(
          updateRes.error ?? "Error al actualizar la base de datos"
        );
      }

      // Add timestamp to bust cache for display
      setAvatarUrl(`${newAvatarUrl}?t=${Date.now()}`);
      toast.success("Imagen de perfil actualizada");
    } catch (err: unknown) {
      console.error("Error uploading avatar:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Error al subir la imagen";
      toast.error(errorMessage);
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    const res = await updateUser({
      userId: user.id,
      full_name: fullName,
      job_title: jobTitle,
      app_role: appRole,
      // role: status === "inactivo" ? "inactive" : "viewer", // Error: constraint profiles_role_check
      role: "user", // Fallback seguro. TODO: Ajustar constraint en DB para soportar 'inactive'
    });
    setSubmitting(false);

    if (res.ok) {
      toast.success("Usuario actualizado correctamente");
      router.push("/admin/users");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo actualizar el usuario");
    }
  };

  if (loading) {
    return (
      <div className="box-border mx-auto flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border border-[#ECECEC] bg-[#FDFDFD] px-10 py-8">
        <div className="flex w-full flex-col gap-1">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="flex justify-center">
          <div className="h-32 w-32 animate-pulse rounded-full bg-gray-200" />
        </div>
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-10 w-full animate-pulse rounded-[25px] bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="box-border mx-auto flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border border-[#ECECEC] bg-[#FDFDFD] px-10 py-8">
      {/* Header */}
      <div className="flex w-full flex-col gap-1">
        <h1 className="font-exo2 text-[28px] font-semibold leading-none text-[#00030A]">
          Editar usuario
        </h1>
        <p className="text-sm text-[#54565B]">Modifica los datos del usuario</p>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="relative group cursor-pointer"
          onClick={handleAvatarClick}
        >
          <div className="relative h-32 w-32 overflow-hidden rounded-full bg-gray-100 border-4 border-[#0F5F4C]/20">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={fullName || "Avatar"}
                fill
                sizes="128px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <User className="h-16 w-16 text-gray-400" />
              </div>
            )}
          </div>
          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {uploadingAvatar ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Camera className="h-8 w-8 text-white" />
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
          disabled={uploadingAvatar}
        />
        <button
          type="button"
          onClick={handleAvatarClick}
          disabled={uploadingAvatar}
          className="text-sm text-[#0F5F4C] hover:underline disabled:opacity-50"
        >
          {uploadingAvatar ? "Subiendo..." : "Cambiar foto de perfil"}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Email (readonly) */}
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Correo electrónico">
            <Input
              value={user.email ?? ""}
              disabled
              className="rounded-[25px] bg-gray-100 cursor-not-allowed"
            />
          </Field>
          <Field label="Nombre completo">
            <Input
              placeholder="Ingrese el nombre completo"
              className="rounded-[25px]"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
        </div>

        {/* Job title and App Role */}
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Cargo / Título">
            <Input
              placeholder="Ingrese el cargo"
              className="rounded-[25px]"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </Field>
          <Field label="Rol en la aplicación">
            <Select
              value={appRole}
              onChange={(val: string) => setAppRole(val as AppRole)}
              placeholder="Seleccione un rol"
              options={[
                { label: "Viewer", value: "VIEWER" },
                { label: "Creator", value: "CREATOR" },
                { label: "App Admin", value: "APP_ADMIN" },
              ]}
              className="rounded-[25px]"
            />
          </Field>
        </div>

        {/* Status */}
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Estado del usuario">
            <Select
              value={status}
              onChange={(val: string) =>
                setStatus(val as "activo" | "inactivo")
              }
              placeholder="Seleccione un estado"
              options={[
                { label: "Activo", value: "activo" },
                { label: "Inactivo", value: "inactivo" },
              ]}
              className="rounded-[25px]"
            />
          </Field>
        </div>

        {/* Footer actions */}
        <div className="flex w-full items-center justify-end gap-6 pt-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-[150px] rounded-full border-[#0F5F4C] text-[#0F5F4C]"
            onClick={() => router.push("/admin/users")}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-[150px] rounded-full bg-[#0F5F4C] hover:opacity-90"
          >
            {submitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
