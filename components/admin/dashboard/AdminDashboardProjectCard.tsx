import Image from "next/image";
import Link from "next/link";
import EllipsisHorizontalIcon from "@/components/icons/EllipsisHorizontalIcon";
import * as React from "react";

// Definimos el tipo de datos que espera la tarjeta
export interface Dashboard {
  id: string;
  title: string;
  imageUrl: string;
  status: "Publicado" | "Borrador";
  description: string;
  company: string;
  peopleCount: number;
}

// Icono simple de usuarios (grupo) inline para evitar dependencias extras
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20a8 8 0 1 1 16 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// El componente recibe un objeto de tipo Dashboard
export default function AdminDashboardProjectCard({
  dashboard,
}: {
  dashboard: Dashboard;
}) {
  const { id, title, imageUrl, status, description, company, peopleCount } =
    dashboard;

  // Clases condicionales para el badge de estado
  const statusClasses =
    status === "Publicado"
      ? "bg-[#DCFCE7] text-[#016730]"
      : status === "Borrador"
      ? "bg-[#FFEDA3] text-[#CBA200]"
      : "bg-gray-200 text-gray-700"; // fallback

  return (
    <Link
      href={`/admin/dashboard/${id}`}
      aria-label={`Abrir dashboard ${title}`}
      className="flex w-full flex-col overflow-hidden rounded-[15px] bg-white shadow-[0px_4px_24px_rgba(109,141,173,0.15)] hover:shadow-[0px_6px_28px_rgba(109,141,173,0.18)] transition-shadow"
    >
      {/* Imagen de Vista Previa */}
      <div className="relative h-[193px] w-full">
        <Image
          src={imageUrl}
          alt={`Vista previa de ${title}`}
          fill
          className="object-cover"
        />
      </div>

      {/* Contenido de la Tarjeta */}
      <div className="flex flex-col gap-2.5 p-5">
        <h3 className="text-lg font-semibold text-black">{title}</h3>

        {/* Empresa */}
        <p className="text-xs text-[#54565B]">{company}</p>

        {/* Badge de Estado */}
        <span
          className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
        >
          {status}
        </span>

        <p className="h-8 text-xs font-normal text-[#54565B]">{description}</p>

        {/* Divisor */}
        <hr className="my-1 border-t border-gray-200" />

        {/* Pie de la Tarjeta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#54565B]">
            <UsersIcon className="h-4 w-4" />
            <span className="text-[10px] font-normal">
              {peopleCount} personas
            </span>
          </div>
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
    </Link>
  );
}
