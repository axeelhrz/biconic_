"use client";
// Force TS update


import * as React from "react"
import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof HeadlessSwitch>,
  React.ComponentPropsWithoutRef<typeof HeadlessSwitch> & {
      onCheckedChange?: (checked: boolean) => void;
      checked?: boolean;
  }
>(({ className, checked, onCheckedChange, ...props }, ref) => (
  <HeadlessSwitch
    checked={checked ?? false}
    onChange={onCheckedChange || (() => {})}
    className={cn(
      "peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
       checked ? "bg-primary" : "bg-input",
      className
    )}
    {...props}
    ref={ref as any}
  >
    <span
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
        checked ? "translate-x-5" : "translate-x-0"
      )}
    />
  </HeadlessSwitch>
))
Switch.displayName = "Switch"

export { Switch }
