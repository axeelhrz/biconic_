import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import EyeIcon from "../icons/EyeIcon";
import EllipsisHorizontalIcon from "../icons/EllipsisHorizontalIcon";
import ShareDashboardModal from "./ShareDashboardModal"; // Import the modal

// Definimos el tipo de datos que espera la tarjeta
export interface Dashboard {
  id: string;
  title: string;
  imageUrl: string;
  status: "Publicado" | "Borrador"; // Podemos ser específicos con los estados
  description: string;
  views: number;
  owner?: { fullName: string | null };
  // New fields for sharing logic
  clientId?: string;
  ownerId?: string;
}

interface DashboardCardProps {
    dashboard: Dashboard;
    href?: string;
    onDelete?: (dashboard: Dashboard) => void;
}

// Inline Share Icon if not available (copying from EtlCard for consistency)
const InlineShareIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 15.31 8.04 15.81L15.12 19.95C15.08 20.17 15.04 20.4 15.04 20.62C15.04 22.28 16.38 23.62 18.04 23.62C19.7 23.62 21.04 22.28 21.04 20.62C21.04 18.96 19.7 17.62 18 17.62"
      fill="currentColor"
    />
  </svg>
);

// El componente recibe un objeto de tipo Dashboard
export default function DashboardCard({
  dashboard,
  href,
  onDelete,
}: DashboardCardProps) {
  const { id, title, imageUrl, status, description, views, owner } = dashboard;
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Clases condicionales para el badge de estado
  const statusClasses =
    status === "Publicado"
      ? "bg-[#DCFCE7] text-[#016730]"
      : status === "Borrador"
      ? "bg-[#FFEDA3] text-[#CBA200]"
      : "bg-gray-200 text-gray-700"; // fallback

  return (
    <>
      <Link
        href={href ?? `/dashboard/${id}`}
        aria-label={`Abrir dashboard ${title}`}
        className="flex w-full flex-col overflow-hidden rounded-[15px] bg-white shadow-[0px_4px_24px_rgba(109,141,173,0.15)] hover:shadow-[0px_6px_28px_rgba(109,141,173,0.18)] transition-shadow"
      >
        {/* Imagen de Vista Previa */}
        <div className="relative h-[193px] w-full">
          <Image
            src={imageUrl}
            alt={`Vista previa de ${title}`}
            layout="fill"
            objectFit="cover"
          />
        </div>

        {/* Contenido de la Tarjeta */}
        <div className="flex flex-col gap-2.5 p-5">
          <h3 className="text-lg font-semibold text-black">{title}</h3>

          {/* Badge de Estado */}
          <span
            className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
          >
            {status}
          </span>

          <p className="h-8 text-xs font-normal text-[#54565B]">{description}</p>

          {owner && owner.fullName && (
            <p className="mt-1 text-xs font-medium text-blue-600">
              Propietario: {owner.fullName}
            </p>
          )}

          {/* Divisor */}
          <hr className="my-1 border-t border-gray-200" />

          {/* Pie de la Tarjeta */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#54565B]">
              <EyeIcon className="h-4 w-4" />
              <span className="text-[10px] font-normal">{views}</span>
            </div>
            
            <div className="flex items-center gap-2">
                {/* Botón Eliminar - Solo si se pasa onDelete */}
                {onDelete && (
                    <button
                        className="text-[#54565B] hover:text-red-600 transition-colors"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(dashboard);
                        }}
                        title="Eliminar Dashboard"
                    >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c0 1 2 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                    </button>
                )}

                {/* Botón Compartir */}
                <button
                className="text-[#54565B] hover:text-black"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShareModalOpen(true);
                }}
                title="Compartir Dashboard"
                >
                <InlineShareIcon className="h-5 w-5" />
                </button>

                <button
                className="text-[#54565B] hover:text-black"
                onClick={(e) => {
                    // Evita navegar cuando se hace click en el botón de opciones
                    e.preventDefault();
                    e.stopPropagation();
                    // TODO: abrir menú contextual
                }}
                >
                <EllipsisHorizontalIcon className="h-5 w-5" />
                </button>
            </div>
          </div>
        </div>
      </Link>
      
      {/* Share Modal - rendered outside Link prevents hydration issues usually, but fragment works */}
      <ShareDashboardModal
        dashboardId={dashboard.id}
        clientId={dashboard.clientId}
        ownerId={dashboard.ownerId}
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        dashboardTitle={dashboard.title}
      />
    </>
  );
}
