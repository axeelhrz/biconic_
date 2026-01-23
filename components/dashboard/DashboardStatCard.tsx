import React from "react";

interface DashboardStatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
}

export default function DashboardStatCard({
  icon: Icon,
  label,
  value,
}: DashboardStatCardProps) {
  return (
    <div
      className="relative flex h-[154px] flex-1 flex-col justify-between overflow-hidden rounded-[17px] 
                 bg-white/5 p-5 shadow-lg backdrop-blur-lg border border-white/20"
    >
      {/* --- Este es el nuevo elemento para el reflejo --- */}
      <div
        className="absolute inset-y-0 left-0 w-px 
                   bg-gradient-to-b from-white/80 via-transparent to-white/30"
      ></div>

      {/* --- El resto del contenido se mantiene igual, pero ahora está sobre el reflejo --- */}
      <div className="relative z-10 flex flex-col items-start gap-2">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[20px] border-[0.5px] border-[#FDFDFD]/50">
          <Icon className="h-4 w-4 text-[#FDFDFD]" />
        </div>
        <p className="text-base font-medium text-[#FDFDFD]">{label}</p>
      </div>
      <h3 className="relative z-10 text-2xl font-semibold text-[#FDFDFD]">
        {value}
      </h3>
    </div>
  );
}
