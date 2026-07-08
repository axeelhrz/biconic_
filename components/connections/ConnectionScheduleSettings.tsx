"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/Select";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ETL_SCHEDULE_FREQUENCIES, formatScheduleDateTime } from "@/lib/etl/schedule";
import { safeJsonResponse } from "@/lib/safe-json-response";

export type ConnectionScheduleSettingsProps = {
  connectionId: string;
  connectionType?: string;
};

const FREQUENCY_OPTIONS = [
  { value: "", label: "Ninguna (solo manual)" },
  ...ETL_SCHEDULE_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
];

function isExcelType(type?: string): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "excel" || t === "excel_file";
}

export default function ConnectionScheduleSettings({
  connectionId,
  connectionType,
}: ConnectionScheduleSettingsProps) {
  const [frequency, setFrequency] = useState("");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextExecution, setNextExecution] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/schedule`, {
        credentials: "include",
      });
      const data = await safeJsonResponse(res);
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al cargar programación");
      }
      const d = data.data as {
        frequency: string | null;
        lastRunAt: string | null;
        nextExecution: string;
      };
      setFrequency(d.frequency ?? "");
      setLastRunAt(d.lastRunAt);
      setNextExecution(d.nextExecution);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ frequency: frequency || null }),
      });
      const data = await safeJsonResponse(res);
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al guardar");
      }
      const d = data.data as {
        frequency: string | null;
        lastRunAt: string | null;
        nextExecution: string;
      };
      setFrequency(d.frequency ?? "");
      setLastRunAt(d.lastRunAt);
      setNextExecution(d.nextExecution);
      toast.success("Programación guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const formatLastRun = (iso: string | null) => {
    if (!iso) return "—";
    return formatScheduleDateTime(iso);
  };

  const excel = isExcelType(connectionType);

  return (
    <div
      className="rounded-xl border p-4 space-y-3 mt-5"
      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
    >
      <div>
        <h3
          className="text-base font-medium flex items-center gap-2"
          style={{ color: "var(--platform-fg)" }}
        >
          <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--platform-accent)" }} />
          Actualización automática
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
          {excel
            ? "Programá con qué frecuencia se vuelve a importar el archivo y se ejecutan los ETL vinculados. Horarios en Argentina (ART)."
            : "Programá con qué frecuencia se ejecutan los ETL vinculados para traer datos nuevos de esta conexión. Horarios en Argentina (ART)."}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <>
          <div className="max-w-xs">
            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
              Frecuencia
            </Label>
            <Select
              value={frequency}
              onChange={(v: string) => setFrequency(v ?? "")}
              options={FREQUENCY_OPTIONS}
              placeholder="Elegir frecuencia"
              disablePortal
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-medium mb-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                Última actualización programada
              </p>
              <p style={{ color: "var(--platform-fg)" }}>{formatLastRun(lastRunAt)}</p>
            </div>
            <div>
              <p className="font-medium mb-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                Próxima estimada
              </p>
              <p style={{ color: "var(--platform-fg)" }}>{nextExecution || "—"}</p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar programación"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
