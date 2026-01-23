"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      richColors
      closeButton
      position="top-center"
      expand
      toastOptions={{
        duration: 3500,
      }}
    />
  );
}
