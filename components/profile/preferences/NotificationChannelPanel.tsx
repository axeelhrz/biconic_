// src/components/profile/preferences/NotificationChannelPanel.tsx
"use client";

import CustomRadio from "@/components/ui/CustomRadio";
import { EnvelopeIcon } from "@/components/icons/EnvelopeIcon";
import { WhatsAppIcon } from "@/components/icons/WhatsappIcon";
import { BellIcon } from "@/components/icons/BellIcon";

export const NOTIFICATION_CHANNELS = [
  { id: "email", name: "Email", icon: <EnvelopeIcon className="h-6 w-6" /> },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: <WhatsAppIcon className="h-6 w-6" />,
  },
  {
    id: "in-app",
    name: "En la aplicación",
    icon: <BellIcon className="h-6 w-6" />,
  },
];

interface NotificationChannelPanelProps {
  // Lista de canales seleccionados (multi-select)
  selectedChannels: string[];
  // Toggle de un canal
  onToggle: (id: string) => void;
  loading?: boolean;
}

export default function NotificationChannelPanel({
  selectedChannels,
  onToggle,
  loading,
}: NotificationChannelPanelProps) {
  console.log("selectedChannels", selectedChannels);
  return (
    <div className="flex-1 rounded-[18px] bg-[#F6F6F6] p-[15px]">
      <div className="flex flex-col gap-[15px] rounded-[25px] bg-white p-5">
        <h3 className="font-exo2 text-[19.47px] font-medium leading-[19px] text-[#00030A]">
          Canales de notificación
        </h3>
        {NOTIFICATION_CHANNELS.map((channel) => (
          <button
            key={channel.id}
            disabled={loading}
            onClick={() => onToggle(channel.id)}
            className="flex w-full cursor-pointer items-center gap-[15px] rounded-xl border border-[#D9DCE3] px-5 py-4 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {channel.icon}
            <span className="flex-grow font-poppins text-base text-[#282828]">
              {channel.name}
            </span>
            <CustomRadio checked={selectedChannels.includes(channel.id)} />
          </button>
        ))}
      </div>
    </div>
  );
}
