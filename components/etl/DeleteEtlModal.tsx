"use client";

import { useEffect, useState } from "react";

export function DeleteEtlModal({
  open,
  onOpenChange,
  onConfirm,
  etlName,
  isDeleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  etlName: string;
  isDeleting?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) setInputValue("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Eliminar ETL</h2>
          <p className="mt-2 text-sm text-red-600">
            Esta acción no se puede deshacer. Esto eliminará permanentemente el
            ETL <strong>{etlName}</strong> y todos sus datos asociados.
          </p>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Para confirmar, escribe <strong>{etlName}</strong> a continuación:
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm p-2 border"
              placeholder={etlName}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={inputValue !== etlName || isDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isDeleting ? "Eliminando..." : "Eliminar ETL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
