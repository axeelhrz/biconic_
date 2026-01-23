// src/components/ui/CustomToggle.tsx

interface CustomToggleProps {
  checked: boolean;
  onChange: () => void;
}

export default function CustomToggle({ checked, onChange }: CustomToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${
        checked
          ? "bg-gradient-to-r from-[#32E9A1] via-[#40EF8E] via-60% to-[#02B8D1]"
          : "bg-gray-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
