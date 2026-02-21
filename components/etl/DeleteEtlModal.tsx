"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

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

  useEffect(() => {
    if (open) setInputValue("");
  }, [open]);

  const canConfirm = inputValue.trim() === etlName.trim() && !isDeleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 gap-0 border-0 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1a1d21 0%, #141619 100%)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(239, 68, 68, 0.2)",
        }}
      >
        <div
          className="flex items-start gap-3 p-6 pb-4"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(239, 68, 68, 0.2)" }}
          >
            <AlertTriangle className="h-5 w-5" style={{ color: "#f87171" }} />
          </div>
          <div>
            <DialogTitle
              className="text-lg font-semibold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Eliminar ETL
            </DialogTitle>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              Esta acción no se puede deshacer. Se eliminará permanentemente el ETL{" "}
              <strong style={{ color: "rgba(255,255,255,0.95)" }}>{etlName}</strong> y todos sus datos asociados.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              Para confirmar, escribe <strong>{etlName}</strong> a continuación:
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2"
              style={{
                background: "rgba(0,0,0,0.25)",
                borderColor: inputValue && !canConfirm ? "rgba(239, 68, 68, 0.5)" : "rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.95)",
              }}
              placeholder={etlName}
              disabled={isDeleting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
              style={{
                borderColor: "rgba(255,255,255,0.2)",
                color: "rgba(255,255,255,0.9)",
                background: "transparent",
              }}
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canConfirm ? "#dc2626" : "rgba(239, 68, 68, 0.4)",
                color: "#fff",
                boxShadow: canConfirm ? "0 2px 8px rgba(239, 68, 68, 0.35)" : "none",
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                "Eliminar ETL"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
