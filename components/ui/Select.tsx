// src/components/ui/Select.tsx
"use client";

import * as React from "react";
import { Listbox, Transition } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  label: string;
  value: string;
};

export interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  /** Clases para el panel desplegable (lista de opciones) */
  optionsClassName?: string;
  /** Clases para cada opción (se combinan con estado active) */
  optionClassName?: string;
  disabled?: boolean;
  name?: string;
  // To support react-hook-form register spread
  [key: string]: any;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      onChange,
      options,
      placeholder = "Seleccione",
      className,
      buttonClassName,
      optionsClassName,
      optionClassName,
      disabled,
      name,
      ...rest
    },
    ref
  ) => {
    // Keep this component controlled by normalizing undefined -> ''
    const [internalValue, setInternalValue] = React.useState<string>(
      value ?? ""
    );

    React.useEffect(() => {
      setInternalValue(value ?? "");
    }, [value]);

    const selectedOption = options.find(
      (o: SelectOption) => o.value === internalValue
    );

    const handleChange = (val: string) => {
      setInternalValue(val);
      onChange?.(val);
      // Bubble synthetic event for RHF when register spread is passed
      if (rest?.onChange && typeof rest.onChange === "function") {
        const syntheticEvent = {
          target: { name, value: val },
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        rest.onChange(syntheticEvent);
      }
    };

    // Measure trigger width so the options panel can be at least that wide
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const [buttonWidth, setButtonWidth] = React.useState<number>(0);

    React.useEffect(() => {
      const updateSize = () => {
        if (buttonRef.current) {
          setButtonWidth(buttonRef.current.offsetWidth || 0);
        }
      };
      updateSize();
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }, []);

    return (
      <Listbox
        value={internalValue}
        onChange={handleChange}
        disabled={disabled}
      >
        {({ open }) => (
          <div className={cn("relative w-full", className)}>
            <Listbox.Button
              ref={(el) => {
                // keep both the forwarded ref and our local ref in sync
                if (typeof ref === "function") ref(el as any);
                else if (ref)
                  (
                    ref as React.MutableRefObject<HTMLButtonElement | null>
                  ).current = el;
                buttonRef.current = el;
              }}
              name={name}
              className={cn(
                "h-10 w-full rounded-[25px] border px-4 text-[16px] font-light focus:outline-none",
                "flex items-center justify-between",
                "border-[var(--platform-border,#D9DCE3)] bg-[var(--platform-bg,#fff)] text-[var(--platform-fg,#555555)]",
                disabled && "opacity-50 cursor-not-allowed",
                buttonClassName
              )}
              {...rest}
            >
              <span
                className={cn("truncate", !selectedOption && "opacity-70")}
                style={{ color: "inherit" }}
              >
                {selectedOption ? selectedOption.label : placeholder}
              </span>
              <ChevronDown
                className="ml-2 h-4 w-4 text-gray-500"
                aria-hidden="true"
              />
            </Listbox.Button>

            <Transition
              show={open}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Listbox.Options
                className={cn(
                  "absolute z-10 mt-2 max-h-60 w-auto max-w-[90vw] overflow-auto rounded-2xl border py-2 shadow-lg focus:outline-none whitespace-nowrap",
                  "border-[var(--platform-border,#D9DCE3)] bg-[var(--platform-bg,#fff)]",
                  optionsClassName
                )}
                style={{ minWidth: buttonWidth || undefined }}
              >
                {options.map((option: SelectOption) => (
                  <Listbox.Option
                    key={option.value}
                    className={({ active }) =>
                      cn(
                        "relative cursor-pointer select-none px-4 py-2 text-[16px]",
                        "text-[var(--platform-fg,#555555)]",
                        active && "bg-[var(--platform-surface-hover,#f3f4f6)]",
                        optionClassName
                      )
                    }
                    value={option.value}
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span className={cn(selected && "font-medium")}>
                          {option.label}
                        </span>
                        {selected ? (
                          <Check className="h-4 w-4 text-[var(--platform-accent,#02B8D1)]" />
                        ) : null}
                      </div>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        )}
      </Listbox>
    );
  }
);

Select.displayName = "Select";
