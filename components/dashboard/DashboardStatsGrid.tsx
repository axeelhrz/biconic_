import React from "react";
import StatCard from "./DashboardStatCard";

// Definimos la estructura de los datos que recibirá
interface Stat {
  id: string;
  icon: React.ElementType;
  label: string;
  value: string | number;
}

interface StatsGridProps {
  stats: Stat[];
}

export default function DashboardStatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-[25px] bg-[#00030A]">
      {/* --- Capa de Fondo (Glow Effect) --- */}
      <div className="absolute inset-0 z-0 flex items-center justify-between px-20">
        <div className="h-[150px] w-[300px] rounded-full bg-gradient-to-r from-[#32E9A1] via-[#02B8D1] to-[#08CDEF] blur-[75px]"></div>
        <div className="h-[150px] w-[300px] rounded-full bg-gradient-to-l from-[#32E9A1] via-[#02B8D1] to-[#08CDEF] blur-[75px]"></div>
      </div>

      {/* --- Capa de Contenido (Las Tarjetas) --- */}
      <div className="relative z-10 grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6 lg:flex lg:h-[219px] lg:items-center lg:justify-between">
        {stats.map((stat) => (
          <StatCard
            key={stat.id}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
          />
        ))}
      </div>
    </div>
  );
}
