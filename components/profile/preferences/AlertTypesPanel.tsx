"use client";

import CustomToggle from "@/components/ui/CustomToggle";

export interface AlertPref {
  id: string;
  name: string;
  enabled: boolean;
}

interface AlertTypesPanelProps {
  alerts: AlertPref[];
  onToggle: (id: string) => void;
  loading?: boolean;
}

export default function AlertTypesPanel({
  alerts,
  onToggle,
  loading,
}: AlertTypesPanelProps) {
  return (
    <div className="flex-1 rounded-[18px] bg-[#F6F6F6] p-[15px]">
      <div className="flex flex-col gap-[15px] rounded-[25px] bg-white p-5">
        <h3 className="font-exo2 text-[19.47px] font-medium leading-[19px] text-[#00030A]">
          Tipos de Alertas
        </h3>
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex w-full items-center gap-[15px] rounded-xl border border-[#19A180] px-5 py-[16px]" // py-4 es 16px, py-[16px] es exacto para 54px altura
          >
            <span className="flex-grow font-poppins text-base text-[#282828]">
              {alert.name}
            </span>
            <CustomToggle
              checked={alert.enabled}
              onChange={() => !loading && onToggle(alert.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
