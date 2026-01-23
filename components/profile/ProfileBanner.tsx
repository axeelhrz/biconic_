import Image from "next/image";
import ProfileBannerBackground from "./ProfileBannerBackground";

interface ProfileBannerProps {
  name: string;
  role: string;
  imageUrl: string;
}

// Definiciones de tamaño para mantener la consistencia
const AVATAR_H = 110;
const AVATAR_W = 140;
const AVATAR_WRAPPER_PADDING = 8; // p-1 en tailwind, que es 4px por lado. Usaremos 8px total.
const TOTAL_AVATAR_DIAMETER = AVATAR_H + AVATAR_WRAPPER_PADDING; // 118px

// Constantes de posición (ajustadas para el diseño visual)
const SVG_HEIGHT = 193; // La altura nativa del SVG
const AVATAR_TOP_OFFSET = 65;
const AVATAR_LEFT_OFFSET = 95; // left-10 = 40px

const ProfileBanner = ({ name, role, imageUrl }: ProfileBannerProps) => {
  // Posición del texto calculada:
  // (Left del avatar) + (Diámetro total del avatar) + (Margen extra, 12px)
  const textLeftPosition = AVATAR_LEFT_OFFSET + TOTAL_AVATAR_DIAMETER + 72;

  // Altura mínima del contenedor basada en el avatar y el espaciado
  const minContainerHeight = AVATAR_TOP_OFFSET + TOTAL_AVATAR_DIAMETER + 40; // 40px de padding inferior

  return (
    // Contenedor principal.
    // Usamos `min-h-[...]` basado en la posición del avatar.
    <div
      style={{ minHeight: `${minContainerHeight}px` }}
      className="relative w-full max-w-[1230px] rounded-[20px] border border-[#DADCEE] bg-white overflow-hidden"
    >
      {/* 1. Fondo SVG */}
      {/* - `absolute` lo saca del flujo.
          - `w-[1230px]` le da el ancho fijo ORIGINAL del SVG, forzando el desbordamiento.
          - `h-[193px]` le da la altura fija ORIGINAL del SVG.
          - `z-0` lo envía al fondo. 
          
          Esto asegura que el punto de corte para el avatar NO cambie de posición, 
          incluso si el banner se achica a 500px. */}
      <ProfileBannerBackground className="absolute top-0 left-0 w-[1230px] h-[193px] z-0" />

      {/* 2. Avatar */}
      {/* Posición absoluta fija basada en píxeles. */}
      <div
        style={{
          top: `${AVATAR_TOP_OFFSET}px`,
          left: `${AVATAR_LEFT_OFFSET}px`,
        }}
        className="absolute z-20 flex-shrink-0 p-1 bg-white rounded-full shadow-md"
      >
        <Image
          src={imageUrl}
          alt={`Foto de perfil de ${name}`}
          width={AVATAR_W}
          height={AVATAR_H}
          className="rounded-full object-cover border-2 border-gray-700"
        />
      </div>

      {/* 3. Información del Usuario */}
      {/* Posición absoluta fija, calculada para alinearse. */}
      <div
        style={{
          top: `${AVATAR_TOP_OFFSET + AVATAR_H / 1 - 40}px`,
          left: `${textLeftPosition}px`,
        }}
        className="absolute z-10 flex items-center"
      >
        {/* Línea vertical decorativa (h-10 = 40px) */}
        <div className="w-1 h-10 bg-[#29D6E5] rounded-full mr-4"></div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{name}</h2>
          <p className="text-sm text-gray-500">{role}</p>
        </div>
      </div>
    </div>
  );
};

export default ProfileBanner;
