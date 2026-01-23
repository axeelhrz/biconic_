"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ChangePasswordForm from "./ChangePasswordForm";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="p-0 border-0 shadow-lg bg-white sm:max-w-[618px] rounded-[20px]"
      >
        <DialogTitle className="sr-only">Cambiar contraseña</DialogTitle>
        <div className="relative">
          {/* Botón cerrar */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-5 right-5 flex items-center justify-center w-8 h-8 border border-[#035664] rounded-full text-[#035664] hover:bg-[#035664]/10 transition-colors"
            aria-label="Cerrar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
          <ChangePasswordForm
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
