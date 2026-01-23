// src/components/profile/security/PasswordCard.tsx

import SecurityCard from "./SecurityCard";
import { useState } from "react";
import ChangePasswordDialog from "./ChangePasswordDialog";

export default function PasswordCard() {
  const [open, setOpen] = useState(false);

  const handleChangePassword = () => {
    setOpen(true);
  };

  const ActionButton = (
    <button
      onClick={handleChangePassword}
      className="flex flex-row items-center justify-center gap-[6.49px] rounded-full border-[0.24px] border-[#0F5F4C] px-[16.22px] py-[8.11px] text-[#0F5F4C] transition-colors hover:bg-[#0f5f4c]/10"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-4 w-4" // 16.23px es aprox h-4 w-4 (16px)
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      {/* Estilos del texto del botón */}
      <span className="font-poppins text-center text-[15px] font-medium leading-5">
        Cambiar contraseña
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={3}
        stroke="currentColor"
        className="h-4 w-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
        />
      </svg>
    </button>
  );

  return (
    <>
      <SecurityCard title="Contraseña" actionElement={ActionButton}>
        {/* Contenedor para el texto con gradiente */}
        <div className="flex-grow font-poppins text-base font-medium leading-6">
          <p className="bg-gradient-to-b from-[#191B24] via-[#242D34] to-[#225659] bg-clip-text text-transparent">
            Contraseña actual
          </p>
          <p className="bg-gradient-to-b from-[#191B24] via-[#242D34] to-[#225659] bg-clip-text text-transparent">
            Última actualización: 15 de Marzo, 2024
          </p>
        </div>
      </SecurityCard>
      <ChangePasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
