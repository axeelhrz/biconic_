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
                if (typeof ref === "function") ref(el as any);
                else if (ref)
                  (
                    ref as React.MutableRefObject<HTMLButtonElement | null>
                  ).current = el;
                buttonRef.current = el;
              }}
              name={name}
              className={cn(
                "flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]",
                disabled && "opacity-50 cursor-not-allowed",
                buttonClassName
              )}
              style={{
                borderColor: "var(--platform-border)",
                background: "var(--platform-surface)",
                color: "var(--platform-fg-muted)",
              }}
              {...rest}
            >
              <span className="truncate">
                {selectedOption ? selectedOption.label : placeholder}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
                  "absolute left-0 top-full z-50 mt-2 w-full overflow-auto rounded-2xl border p-3 focus:outline-none",
                  optionsClassName
                )}
                style={{
                  minWidth: buttonWidth || undefined,
                  borderColor: "var(--platform-border)",
                  background: "var(--platform-surface)",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                }}
              >
                <div className="max-h-[220px] overflow-y-auto rounded-xl -mx-1 px-1" style={{ background: "var(--platform-bg)" }}>
                  <div className="flex flex-col gap-0.5">
                    {options.map((option: SelectOption) => (
                      <Listbox.Option
                        key={option.value}
                        className={({ selected }) =>
                          cn(
                            "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-all",
                            selected && "ring-2 ring-[var(--platform-accent)]",
                            selected ? "bg-[var(--platform-accent-dim)] text-[var(--platform-accent)]" : "bg-transparent text-[var(--platform-fg)]",
                            optionClassName
                          )
                        }
                        value={option.value}
                      >
                        {({ selected }) => (
                          <>
                            <span className="truncate">{option.label}</span>
                            {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </div>
                </div>
              </Listbox.Options>
            </Transition>
          </div>
        )}
      </Listbox>
    );
  }
);

Select.displayName = "Select";
