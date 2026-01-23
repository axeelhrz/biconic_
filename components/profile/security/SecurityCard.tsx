// src/components/profile/security/SecurityCard.tsx

import type { ReactNode } from "react";

interface SecurityCardProps {
  title: string;
  children: ReactNode;
  actionElement?: ReactNode;
}

export default function SecurityCard({
  title,
  children,
  actionElement,
}: SecurityCardProps) {
  return (
    // Estilos del contenedor de Figma: padding, border-radius
    <div className="w-full rounded-[25px] bg-neutral-200 p-5">
      <div className="bg-white p-5 rounded-[20px] h-[125px]">
        <div className="flex flex-col gap-[15px]">
          {/* Estilos del título de Figma: font, size, weight, color */}
          <h3 className="font-medium text-[19.47px] leading-[19px] text-[#00030A] self-stretch font-exo2">
            {title}
          </h3>
          <div className="flex items-center justify-between gap-[15px] self-stretch">
            {children}
            {actionElement && <div>{actionElement}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
