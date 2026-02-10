"use client";
import React from "react";

// Definimos las props que recibirá el componente para hacerlo reutilizable
interface AdminDashboardSectionHeaderProps {
  title: string;
  subtitle: string;
  buttonText: string;
  onButtonClick?: () => void; // Función opcional para el clic del botón
}

// Usamos la fuente 'Exo 2' a través de una variable CSS que definiremos en el layout
const AdminDashboardSectionHeader: React.FC<
  AdminDashboardSectionHeaderProps
> = ({ title, subtitle, buttonText, onButtonClick }) => {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold leading-none" style={{ color: "var(--platform-fg)" }}>
          {title}
        </h1>
        <p className="text-sm font-normal leading-4" style={{ color: "var(--platform-fg-muted)" }}>
          {subtitle}
        </p>
      </div>

      <button
        onClick={onButtonClick}
        className="flex h-10 items-center justify-center gap-2 rounded-full py-2 pl-5 pr-4 font-medium transition-opacity hover:opacity-90"
        style={{ background: "var(--platform-accent)", color: "#08080b" }}
      >
        <span className="text-[15px] leading-5">{buttonText}</span>
      </button>
    </div>
  );
};

export default AdminDashboardSectionHeader;
