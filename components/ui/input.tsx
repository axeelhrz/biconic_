// src/components/ui/Input.tsx

import React from "react";
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

// Función helper para combinar clases
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Interfaz para los props, extendiendo los atributos nativos de un input
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        // Usamos la función `cn` para combinar las clases base con las que se pasen desde fuera
        className={cn(
          `
          /* --- Dimensiones y Espaciado --- */
          h-10 w-full 
          px-[15px] py-[10px] 
          
          /* --- Borde y Fondo --- */
          rounded-lg 
          border border-[#D9DCE3] 
          bg-white

          /* --- Texto y Placeholder --- */
          text-base text-gray-900 
          placeholder:text-gray-400

          /* --- Estados (Focus) --- */
          focus:outline-none 
          focus:ring-2 focus:ring-blue-500 focus:border-transparent

          /* --- Transiciones --- */
          transition-colors duration-200

          /* --- Deshabilitado --- */
          disabled:cursor-not-allowed disabled:opacity-50
          `,
          className // Clases adicionales que se puedan pasar
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input"; // Nombre para las DevTools de React

export { Input };
