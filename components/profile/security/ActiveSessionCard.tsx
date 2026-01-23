// src/components/profile/security/ActiveSessionsCard.tsx

import SecurityCard from "./SecurityCard";

export default function ActiveSessionsCard() {
  const SessionStatus = (
    <span className="text-sm font-semibold text-green-600">Esta sesión</span>
  );

  return (
    <SecurityCard title="Sesiones Activas" actionElement={SessionStatus}>
      <div className="flex-grow font-poppins text-base font-medium leading-6">
        <p className="text-gray-900">Navegador actual (Chrome - Colombia)</p>
        <p className="text-gray-500">IP: 192.168.100 - Activo Ahora</p>
      </div>
    </SecurityCard>
  );
}
