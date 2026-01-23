// src/components/profile/security/SecuritySettings.tsx

import PasswordCard from "./PasswordCard";
import TwoFactorAuthCard from "./TwoFactorAuthCard";
import ActiveSessionsCard from "./ActiveSessionCard";

export default function SecuritySettings() {
  return (
    <div className="mt-8 flex flex-col gap-5">
      <PasswordCard />
      <TwoFactorAuthCard />
      <ActiveSessionsCard />
    </div>
  );
}
