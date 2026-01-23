// components/SyncItem.tsx
import { Timer } from "lucide-react";
import type { ReactNode } from "react";

// Definimos la "forma" de las props que nuestro componente espera.
// - icon: Puede ser cualquier elemento renderizable por React.
// - title y subtitle: Deben ser strings.
export interface SyncItemProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
}

const SyncItem = ({ icon, title, subtitle }: SyncItemProps) => {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Sección Izquierda: Icono y Texto */}
      <div className="flex items-center gap-4">
        <div className="text-gray-800">{icon}</div>
        <div>
          <h3 className="text-base font-medium text-black">{title}</h3>
          <p className="text-sm font-normal text-gray-500">{subtitle}</p>
        </div>
      </div>

      {/* Sección Derecha: Botón */}
      <button
        type="button"
        className="flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-normal text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <Timer size={16} className="text-gray-600" />
        Configurar
      </button>
    </div>
  );
};

export default SyncItem;
