import type { createServiceRoleClient } from "../supabase/service";
export declare const ETL_SCHEDULE_FREQUENCIES: readonly [{
    readonly value: "15m";
    readonly label: "15 minutos";
}, {
    readonly value: "1h";
    readonly label: "1 hora";
}, {
    readonly value: "6h";
    readonly label: "6 horas";
}, {
    readonly value: "12h";
    readonly label: "12 horas";
}, {
    readonly value: "24h";
    readonly label: "24 horas";
}, {
    readonly value: "1w";
    readonly label: "1 semana";
}, {
    readonly value: "1M";
    readonly label: "1 mes";
}];
export type EtlScheduleFrequency = (typeof ETL_SCHEDULE_FREQUENCIES)[number]["value"];
export type EtlSchedule = {
    frequency?: string;
    lastRunAt?: string;
};
export declare function getIntervalMs(frequency: string): number | null;
export declare function isDue(lastRunAt: string | null | undefined, intervalMs: number): boolean;
export declare function computeNextRunAt(lastRunAt: string | null | undefined, frequency: string | null | undefined): Date | null;
export declare function formatScheduleLabel(frequency: string | null | undefined): string;
export declare const SCHEDULE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";
export declare function formatScheduleDateTime(date: Date | string, locale?: string, timeZone?: string): string;
export declare function formatNextExecutionDisplay(lastRunAt: string | null | undefined, frequency: string | null | undefined, locale?: string): string;
export declare function parseScheduleFromLayout(layout: unknown): EtlSchedule | undefined;
export declare const ACTIVE_RUN_GUARD_MINUTES: number;
export declare function getStaleRunMinutes(): number;
export declare function getHardStaleRunMinutes(): number;
export declare function mergeScheduleIntoGuidedConfig(guidedConfig: Record<string, unknown>, frequency: string | null | undefined, preserveLastRunAt?: string | null): Record<string, unknown>;
export declare function updateEtlScheduleLastRunAt(supabaseAdmin: ReturnType<typeof createServiceRoleClient>, etlId: string, at?: string): Promise<void>;
