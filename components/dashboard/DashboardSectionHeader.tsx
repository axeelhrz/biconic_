"use client";
import React from "react";

// Definimos las props que recibirá el componente para hacerlo reutilizable
interface DashboardSectionHeaderProps {
  title: string;
  subtitle: string;
  buttonText: string;
  onButtonClick?: () => void; // Función opcional para el clic del botón
  buttonComponent?: React.ReactNode; // Componente personalizado para el botón
  showButton?: boolean; // Nuevo: permitir ocultar el botón según el rol
}

// Usamos la fuente 'Exo 2' a través de una variable CSS que definiremos en el layout
const DashboardSectionHeader: React.FC<DashboardSectionHeaderProps> = ({
  title,
  subtitle,
  buttonText,
  onButtonClick,
  buttonComponent,
  showButton = true,
}) => {
  return (
    <div className="flex w-full items-center justify-between">
      {/* Sección de Título y Subtítulo */}
      <div className="flex flex-col gap-1">
        <h1 className="font-exo2 text-[28px] font-semibold leading-none text-[#00030A]">
          {title}
        </h1>
        <p className="text-sm font-normal leading-4 text-[#717182]">
          {subtitle}
        </p>
      </div>

      {/* Botón de Acción Principal */}
      {showButton &&
        (buttonComponent || (
          <button
            onClick={onButtonClick}
            className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#0F5F4C] py-2 pl-5 pr-4 text-white transition-opacity hover:opacity-90"
          >
            <span className="text-[15px] font-medium leading-5">
              {buttonText}
            </span>
            {/* Aquí podrías agregar un ícono si fuera necesario */}
          </button>
        ))}
    </div>
  );
};

export default DashboardSectionHeader;
