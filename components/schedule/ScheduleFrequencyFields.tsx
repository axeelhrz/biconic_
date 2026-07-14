"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/Select";
import {
  CALENDAR_SCHEDULE_FREQUENCIES,
  ETL_SCHEDULE_FREQUENCIES,
  isCalendarSchedule,
  normalizeRunAtTime,
  normalizeWeekdays,
  type EtlSchedule,
  type ScheduleInput,
} from "@/lib/etl/schedule";

export type ScheduleFormState = {
  frequency: string;
  runAtTime: string;
  runOnWeekdays: number[];
};

export const SCHEDULE_FREQUENCY_OPTIONS = [
  { value: "", label: "Ninguna (solo manual)" },
  ...ETL_SCHEDULE_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
  ...CALENDAR_SCHEDULE_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
];

export function scheduleToFormState(data: {
  frequency?: string | null;
  runAtTime?: string | null;
  runOnWeekdays?: number[] | null;
}): ScheduleFormState {
  return {
    frequency: data.frequency?.trim() ?? "",
    runAtTime: normalizeRunAtTime(data.runAtTime) ?? "09:00",
    runOnWeekdays: normalizeWeekdays(data.runOnWeekdays),
  };
}

export function formStateToScheduleInput(state: ScheduleFormState): ScheduleInput {
  const frequency = state.frequency.trim() || null;
  if (!frequency) return { frequency: null };
  if (frequency === "daily" || frequency === "weekly") {
    return {
      frequency,
      runAtTime: state.runAtTime,
      runOnWeekdays: frequency === "weekly" ? state.runOnWeekdays : null,
    };
  }
  return { frequency };
}

export function isCalendarFrequency(frequency: string): boolean {
  return isCalendarSchedule({ frequency });
}

type ScheduleFrequencyFieldsProps = {
  value: ScheduleFormState;
  onChange: (next: ScheduleFormState) => void;
  disablePortal?: boolean;
};

export function ScheduleFrequencyFields({
  value,
  onChange,
  disablePortal,
}: ScheduleFrequencyFieldsProps) {
  const calendar = isCalendarFrequency(value.frequency);

  const toggleWeekday = (day: number, checked: boolean) => {
    const set = new Set(value.runOnWeekdays);
    if (checked) set.add(day);
    else set.delete(day);
    onChange({ ...value, runOnWeekdays: normalizeWeekdays([...set]) });
  };

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
          Frecuencia
        </Label>
        <Select
          value={value.frequency}
          onChange={(v: string) => onChange({ ...value, frequency: v ?? "" })}
          options={SCHEDULE_FREQUENCY_OPTIONS}
          placeholder="Elegir frecuencia"
          disablePortal={disablePortal}
        />
      </div>

      {calendar && (
        <>
          <div className="max-w-xs">
            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>
              Hora (Argentina)
            </Label>
            <Input
              type="time"
              value={value.runAtTime}
              onChange={(e) => onChange({ ...value, runAtTime: e.target.value })}
              className="rounded-xl"
            />
          </div>

          {value.frequency === "weekly" && (
            <div>
              <Label className="text-xs block mb-2" style={{ color: "var(--platform-fg-muted)" }}>
                Días de la semana
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 1, label: "Lun" },
                  { value: 2, label: "Mar" },
                  { value: 3, label: "Mié" },
                  { value: 4, label: "Jue" },
                  { value: 5, label: "Vie" },
                  { value: 6, label: "Sáb" },
                  { value: 0, label: "Dom" },
                ].map((d) => {
                  const checked = value.runOnWeekdays.includes(d.value);
                  return (
                    <label
                      key={d.value}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer"
                      style={{
                        borderColor: checked ? "var(--platform-accent)" : "var(--platform-border)",
                        background: checked ? "color-mix(in srgb, var(--platform-accent) 12%, transparent)" : "transparent",
                        color: "var(--platform-fg)",
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleWeekday(d.value, c === true)}
                      />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function scheduleResponseToFormState(data: {
  frequency?: string | null;
  runAtTime?: string | null;
  runOnWeekdays?: number[] | null;
}): ScheduleFormState {
  return scheduleToFormState(data);
}

export type ScheduleApiData = {
  frequency: string | null;
  lastRunAt: string | null;
  nextExecution: string;
  label?: string;
  runAtTime?: string | null;
  runOnWeekdays?: number[] | null;
};

export function scheduleApiDataToEtlSchedule(data: ScheduleApiData): EtlSchedule | null {
  if (!data.frequency?.trim()) return null;
  return {
    frequency: data.frequency,
    lastRunAt: data.lastRunAt ?? undefined,
    runAtTime: data.runAtTime ?? undefined,
    runOnWeekdays: data.runOnWeekdays ?? undefined,
  };
}
