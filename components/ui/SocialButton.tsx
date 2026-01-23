// src/components/ui/Button.tsx

import React from "react";
import { cn } from "@/lib/utils"; // Usando la misma función helper para combinar clases

// Interfaz para los props, extendiendo los atributos nativos de un botón
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SocialButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        className={cn(
          `
          /* --- Layout y Alineación --- */
          flex items-center justify-center
          gap-2 /* gap: 8px */

          /* --- Dimensiones y Espaciado --- */
          h-10 w-full /* height: 40px; width: 494px */
          py-2.5 px-5 usando la escala de Tailwind */

          /* --- Estilos de Borde y Fondo --- */
          border-[1.5px] border-[#232323]
          rounded-full /* border-radius: 50px para una forma de píldora */
          bg-transparent /* Fondo transparente por defecto */

          /* --- Texto --- */
          text-base font-medium text-[#232323]

          /* --- Transiciones y Estados (Mejoras de UX) --- */
          transition-colors duration-200 ease-in-out
          hover:bg-gray-100 /* Un sutil fondo al pasar el cursor */
          active:bg-gray-200 /* Un efecto al hacer clic */
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#232323]

          /* --- Estado Deshabilitado --- */
          disabled:opacity-50 disabled:cursor-not-allowed
          `,
          className // Permite añadir o sobrescribir clases desde fuera
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

SocialButton.displayName = "Button";

export { SocialButton };
