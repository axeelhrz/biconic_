// src/components/ui/CustomRadio.tsx

interface CustomRadioProps {
  checked: boolean;
}

export default function CustomRadio({ checked }: CustomRadioProps) {
  return (
    <div className="relative flex h-[30px] w-[30px] items-center justify-center">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] bg-white transition-all duration-200 ${
          checked ? "border-teal-500 bg-teal-50" : "border-[#D9DCE3]"
        }`}
      >
        {checked && <div className="h-2.5 w-2.5 rounded-sm bg-teal-500" />}
      </div>
    </div>
  );
}
