// src/components/profile/ProfileSection.tsx

"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProfileSectionHeader from "./ProfileSectionHeader";
import ProfileTabs from "./ProfileTabs";
import ProfileBanner from "./ProfileBanner";
import SecuritySettings from "./security/SecuritySettings";
import PreferencesSettings from "./preferences/PreferencesSettings";
import EditProfileDialog from "./EditProfileDialog";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// Para mapear los slugs de la URL a los índices de las pestañas
const TABS_SLUGS = ["informacion", "seguridad", "preferencias"];

// Componentes de ejemplo para las otras pestañas
const InformationComponent = () => (
  <div className="mt-8">Aquí va la información del perfil.</div>
);
const PreferencesComponent = () => (
  <div className="mt-8">Aquí van las preferencias del usuario.</div>
);

export default function ProfileSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileName, setProfileName] = useState<string>("...");
  const [profileRole, setProfileRole] = useState<string>("...");
  const [avatarUrl, setAvatarUrl] = useState<string>(
    "/images/default-avatar.png"
  );

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setProfileName("Invitado");
          setProfileRole("-");
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, role, email")
          .eq("id", user.id)
          .single();
        if (profileError && profileError.code !== "PGRST116") {
          console.error("Error perfil:", profileError);
        }
        if (active) {
          setProfileName(
            profile?.full_name ||
              user.user_metadata?.full_name ||
              user.email ||
              "Sin nombre"
          );
          setProfileRole(profile?.role || "user");
          // Si tienes storage para avatar podrías traer la URL aquí.
        }
      } catch (e: any) {
        console.error(e);
        toast.error("No se pudo cargar el perfil");
      } finally {
        active && setLoadingProfile(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Derivamos la pestaña activa DIRECTAMENTE de la URL.
  // Si no hay parámetro 'tab', usamos el primero como default.
  const currentTabSlug = searchParams.get("tab") || TABS_SLUGS[0];
  const activeTab = TABS_SLUGS.indexOf(currentTabSlug);

  const handleTabClick = (index: number) => {
    // Cuando se hace clic, actualizamos el parámetro en la URL.
    const newTabSlug = TABS_SLUGS[index];
    router.push(`${pathname}?tab=${newTabSlug}`);
  };

  const renderTabContent = () => {
    // Usamos el `activeTab` derivado de la URL para renderizar.
    switch (activeTab) {
      case 0:
        return <InformationComponent />;
      case 1:
        return <SecuritySettings />;
      case 2:
        return <PreferencesSettings />;
      default:
        // Fallback a la primera pestaña si el slug es inválido
        return <InformationComponent />;
    }
  };

  const handleEditProfile = () => {
    setIsEditDialogOpen(true);
  };

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-16 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-5">
      <ProfileSectionHeader
        title="Perfil"
        subtitle="Gestiona y edita tu perfil"
        buttonText="Editar Perfil"
        onButtonClick={handleEditProfile}
      />
      <ProfileTabs activeTab={activeTab} onTabClick={handleTabClick} />
      <ProfileBanner
        name={profileName}
        role={profileRole}
        imageUrl={avatarUrl}
      />
      {renderTabContent()}
      <EditProfileDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onUpdated={({ name, email }) => {
          // Actualiza el nombre inmediatamente (rol no cambia aquí)
          if (name) setProfileName(name);
          // Si quieres reflejar email en algún sitio futuro, podrías guardarlo en estado.
        }}
      />
    </div>
  );
}
