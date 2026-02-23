// src/components/ui/Select.tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Listbox, Transition } from "@headlessui/react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_MAX_HEIGHT = 260;

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

    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);
    const [buttonWidth, setButtonWidth] = React.useState<number>(0);
    const [anchorRect, setAnchorRect] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null);
    const [listboxOpen, setListboxOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

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

    const updateAnchorRect = React.useCallback(() => {
      if (buttonRef.current) {
        setAnchorRect(buttonRef.current.getBoundingClientRect());
      }
    }, []);

    React.useEffect(() => {
      if (!listboxOpen) return;
      updateAnchorRect();
      window.addEventListener("scroll", updateAnchorRect, true);
      window.addEventListener("resize", updateAnchorRect);
      return () => {
        window.removeEventListener("scroll", updateAnchorRect, true);
        window.removeEventListener("resize", updateAnchorRect);
      };
    }, [listboxOpen, updateAnchorRect]);

    return (
      <Listbox
        value={internalValue}
        onChange={handleChange}
        disabled={disabled}
      >
        {({ open }) => {
          React.useEffect(() => {
            setListboxOpen(open);
            if (!open) setSearchQuery("");
          }, [open]);

          React.useEffect(() => {
            if (open && searchQuery === "") searchInputRef.current?.focus();
          }, [open]);

          const rect = anchorRect ?? (open && buttonRef.current ? buttonRef.current.getBoundingClientRect() : null);
          const canOpenDown = !rect || (typeof window !== "undefined" && rect.top + rect.height + 8 + PANEL_MAX_HEIGHT <= window.innerHeight - 16);
          const panelTop = rect
            ? canOpenDown
              ? rect.top + rect.height + 8
              : Math.max(16, rect.top - PANEL_MAX_HEIGHT - 8)
            : 0;

          const filteredOptions = React.useMemo(
            () =>
              !searchQuery.trim()
                ? options
                : options.filter((o) => o.label.toLowerCase().includes(searchQuery.trim().toLowerCase())),
            [options, searchQuery]
          );

          const optionsPanel = (
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
                static
                className={cn(
                  "fixed overflow-auto rounded-2xl border p-3 focus:outline-none",
                  !canOpenDown ? "mb-2" : "mt-2",
                  optionsClassName
                )}
                style={{
                  zIndex: 9999,
                  width: rect ? rect.width : buttonWidth || undefined,
                  minWidth: 200,
                  maxWidth: 320,
                  maxHeight: typeof window !== "undefined" ? window.innerHeight - 32 : PANEL_MAX_HEIGHT,
                  top: panelTop,
                  left: rect ? rect.left : 0,
                  borderColor: "var(--platform-border)",
                  background: "var(--platform-surface)",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                }}
              >
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--platform-accent)]"
                    style={{
                      borderColor: "var(--platform-border)",
                      background: "var(--platform-bg)",
                      color: "var(--platform-fg)",
                    }}
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto overflow-x-hidden rounded-xl -mx-1 px-1 py-2" style={{ background: "var(--platform-bg)" }}>
                  <div className="flex flex-col gap-0.5">
                    {filteredOptions.length === 0 ? (
                      <div className="py-4 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                        {searchQuery.trim() ? "No hay resultados" : "Sin opciones"}
                      </div>
                    ) : (
                      filteredOptions.map((option: SelectOption) => (
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
                    ))
                    )}
                  </div>
                </div>
              </Listbox.Options>
            </Transition>
          );

          return (
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

              {typeof document !== "undefined" && createPortal(optionsPanel, document.body)}
            </div>
          );
        }}
      </Listbox>
    );
  }
);

Select.displayName = "Select";
