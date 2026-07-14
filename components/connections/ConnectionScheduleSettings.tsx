"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatScheduleDateTime, validateScheduleInput } from "@/lib/etl/schedule";
import { safeJsonResponse } from "@/lib/safe-json-response";
import {
  formStateToScheduleInput,
  ScheduleFrequencyFields,
  scheduleResponseToFormState,
  type ScheduleApiData,
  type ScheduleFormState,
} from "@/components/schedule/ScheduleFrequencyFields";

export type ConnectionScheduleSettingsProps = {
  connectionId: string;
  connectionType?: string;
};

function isExcelType(type?: string): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "excel" || t === "excel_file";
}

export default function ConnectionScheduleSettings({
  connectionId,
  connectionType,
}: ConnectionScheduleSettingsProps) {
  const [form, setForm] = useState<ScheduleFormState>({
    frequency: "",
    runAtTime: "09:00",
    runOnWeekdays: [1],
  });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextExecution, setNextExecution] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyApiData = (d: ScheduleApiData) => {
    setForm(scheduleResponseToFormState(d));
    setLastRunAt(d.lastRunAt);
    setNextExecution(d.nextExecution);
  };

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
      applyApiData(data.data as ScheduleApiData);
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
    const payload = formStateToScheduleInput(form);
    const validationError = validateScheduleInput(payload);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await safeJsonResponse(res);
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al guardar");
      }
      applyApiData(data.data as ScheduleApiData);
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
          <ScheduleFrequencyFields value={form} onChange={setForm} disablePortal />

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
