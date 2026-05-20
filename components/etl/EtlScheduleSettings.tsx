"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/Select";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ETL_SCHEDULE_FREQUENCIES } from "@/lib/etl/schedule";
import { safeJsonResponse } from "@/lib/safe-json-response";

export type EtlScheduleSettingsProps = {
  etlId: string;
  /** Modo embebido en wizard: no muestra botón Guardar; notifica cambios al padre. */
  embedded?: boolean;
  frequency?: string;
  lastRunAt?: string | null;
  nextExecution?: string | null;
  onFrequencyChange?: (frequency: string) => void;
  /** En modo standalone, tras guardar exitoso. */
  onSaved?: (data: { frequency: string | null; lastRunAt: string | null; nextExecution: string }) => void;
  showEditFlowLink?: boolean;
};

const FREQUENCY_OPTIONS = [
  { value: "", label: "Ninguna (solo manual)" },
  ...ETL_SCHEDULE_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
];

export default function EtlScheduleSettings({
  etlId,
  embedded = false,
  frequency: frequencyProp,
  lastRunAt: lastRunAtProp,
  nextExecution: nextExecutionProp,
  onFrequencyChange,
  onSaved,
  showEditFlowLink = true,
}: EtlScheduleSettingsProps) {
  const [frequency, setFrequency] = useState(frequencyProp ?? "");
  const [lastRunAt, setLastRunAt] = useState<string | null>(lastRunAtProp ?? null);
  const [nextExecution, setNextExecution] = useState<string | null>(nextExecutionProp ?? null);
  const [loading, setLoading] = useState(!embedded);
  const [saving, setSaving] = useState(false);

  const loadSchedule = useCallback(async () => {
    if (embedded && frequencyProp !== undefined) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/schedule`);
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
      if (!embedded) toast.error(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [etlId, embedded, frequencyProp]);

  useEffect(() => {
    if (!embedded) loadSchedule();
  }, [embedded, loadSchedule]);

  useEffect(() => {
    if (frequencyProp !== undefined) setFrequency(frequencyProp);
  }, [frequencyProp]);

  useEffect(() => {
    if (lastRunAtProp !== undefined) setLastRunAt(lastRunAtProp);
  }, [lastRunAtProp]);

  useEffect(() => {
    if (nextExecutionProp !== undefined) setNextExecution(nextExecutionProp);
  }, [nextExecutionProp]);

  const handleFrequencyChange = (v: string) => {
    setFrequency(v ?? "");
    onFrequencyChange?.(v ?? "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      onSaved?.(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const formatLastRun = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
            <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--platform-accent)" }} />
            Actualización automática
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
            Programá con qué frecuencia el sistema traerá los nuevos registros de la base del cliente.
          </p>
        </div>
        {showEditFlowLink && !embedded && (
          <Link
            href={`/admin/etl/${etlId}`}
            className="text-xs font-medium shrink-0 hover:underline"
            style={{ color: "var(--platform-accent)" }}
          >
            Editar flujo
          </Link>
        )}
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
              onChange={(v: string) => handleFrequencyChange(v ?? "")}
              options={FREQUENCY_OPTIONS}
              placeholder="Elegir frecuencia"
            />
          </div>

          {!embedded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium mb-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                  Última ejecución programada
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
          )}

          {!embedded && (
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
          )}
        </>
      )}
    </div>
  );
}
