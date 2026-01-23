// src/components/profile/ProfileTabs.tsx

"use client";

const TABS_DATA = ["Información", "Seguridad", "Preferencias"];

interface ProfileTabsProps {
  activeTab: number;
  onTabClick: (index: number) => void;
}

const ProfileTabs = ({ activeTab, onTabClick }: ProfileTabsProps) => {
  return (
    <div className="flex w-full max-w-[526px] items-center gap-1 rounded-full bg-[#ECEFF4] p-[5px] h-10">
      {TABS_DATA.map((tab, index) => (
        <button
          key={tab}
          onClick={() => onTabClick(index)}
          className={`
            h-full flex-1 rounded-full text-center text-sm font-medium text-[#00030A] transition-all duration-300
            ${
              activeTab === index
                ? "bg-[#23E3B4] shadow-sm"
                : "hover:bg-gray-200/50"
            }
          `}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default ProfileTabs;
