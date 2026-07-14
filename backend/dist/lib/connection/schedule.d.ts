import { ETL_SCHEDULE_FREQUENCIES, formatNextExecutionDisplay, formatScheduleLabel, type EtlSchedule } from "../etl/schedule";
export { ETL_SCHEDULE_FREQUENCIES, formatNextExecutionDisplay, formatScheduleLabel };
export type ConnectionSchedule = EtlSchedule;
export declare function parseScheduleFromConnectionConfig(config: unknown): ConnectionSchedule | undefined;
export declare function mergeScheduleIntoConnectionConfig(config: Record<string, unknown> | null | undefined, frequency: string | null | undefined, preserveLastRunAt?: string | null): Record<string, unknown>;
export declare function updateConnectionScheduleLastRunAt(connectionId: string, at?: string): Promise<void>;
