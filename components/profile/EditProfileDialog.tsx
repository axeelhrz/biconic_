"use client";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import EditProfileForm from "./EditProfileForm";

type EditProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (values: { name: string; email: string }) => void; // provide new values back
};

export default function EditProfileDialog({
  open,
  onOpenChange,
  onUpdated,
}: EditProfileDialogProps) {
  // EditProfileForm ya maneja la actualización en Supabase internamente.
  // Aquí sólo escuchamos el éxito para propagar el nuevo nombre/email al padre.
  const handleSuccess = (values: { name: string; email: string }) => {
    onUpdated?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true} // Assuming you want a close button
        className="p-0 border-0 shadow-lg bg-white sm:max-w-[618px] rounded-[20px]"
      >
        <DialogTitle className="sr-only">Editar Perfil</DialogTitle>
        <EditProfileForm
          onSuccess={() => {
            /* handled via onSubmit path */
          }}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            // No lógica adicional: la propia forma hace upsert; sólo propagamos
            handleSuccess(values);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
