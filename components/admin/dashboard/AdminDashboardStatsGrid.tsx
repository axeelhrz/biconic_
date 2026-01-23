import React from "react";
import StatCard from "../../dashboard/DashboardStatCard";

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

export default function AdminDashboardStatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-[25px] bg-[#00030A]">
      {/* --- Capa de Fondo (Glow Effect) --- */}
      <div className="absolute inset-0 z-0 flex items-center justify-between px-20">
        <div className="h-[150px] w-[300px] rounded-full bg-gradient-to-r from-[#32E9A1] via-[#02B8D1] to-[#08CDEF] blur-[75px]"></div>
        <div className="h-[150px] w-[300px] rounded-full bg-gradient-to-l from-[#32E9A1] via-[#02B8D1] to-[#08CDEF] blur-[75px]"></div>
      </div>

      {/* --- Capa de Contenido (Las Tarjetas) --- */}
      <div className="relative z-10 flex h-[219px] items-center justify-between gap-4 p-6">
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
