// src/components/profile/security/TwoFactorAuthCard.tsx

import SecurityCard from "./SecurityCard";

export default function TwoFactorAuthCard() {
  // En una aplicación real, este estado vendría de tus props o de un hook.
  const is2FAEnabled = true;

  const StatusBadge = (
    <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
      Activado
    </span>
  );

  return (
    <SecurityCard
      title="Autenticación de Dos Factores"
      actionElement={StatusBadge}
    >
      <div className="flex-grow font-poppins text-base font-medium leading-6">
        <p className="text-gray-900">2FA con aplicación móvil</p>
        <p className="text-gray-500">
          Protege tu cuenta con verificación adicional
        </p>
      </div>
    </SecurityCard>
  );
}
