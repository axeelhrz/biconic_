// src/components/ui/PasswordInput.tsx
"use client"; // Necesario para poder usar el hook `useState`

import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils"; // Función para combinar clases de Tailwind

export interface PasswordInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    // --- PASO 1: Creamos el estado para controlar la visibilidad ---
    // Por defecto, la contraseña está oculta (false).
    const [showPassword, setShowPassword] = useState(false);

    // Función que se ejecuta al hacer clic en el botón del ojo.
    // Simplemente invierte el valor actual del estado.
    const togglePasswordVisibility = () => {
      console.log("Toggling password visibility", showPassword);
      setShowPassword((prevValue) => !prevValue);
    };

    return (
      <div
        className={cn(
          "flex items-center gap-2.5 h-10 w-full px-4 bg-white border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500",
          className
        )}
      >
        <Lock className="h-5 w-5 text-gray-400" />

        <input
          // --- PASO 2: El tipo del input depende del estado ---
          // Si showPassword es true -> type="text"
          // Si showPassword es false -> type="password"
          type={showPassword ? "text" : "password"}
          className="flex-grow h-full bg-transparent border-none focus:outline-none focus:ring-0"
          ref={ref}
          {...props}
        />

        {/* --- PASO 3: Botón que activa el cambio --- */}
        <button
          type="button"
          onClick={togglePasswordVisibility} // Al hacer clic, llamamos a la función de cambio
          className="flex-shrink-0"
          aria-label={
            showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
          }
        >
          {/* --- PASO 4: El icono también cambia según el estado --- */}
          {showPassword ? (
            <EyeOff className="h-5 w-5 text-gray-500 hover:text-gray-700" />
          ) : (
            <Eye className="h-5 w-5 text-gray-500 hover:text-gray-700" />
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
