import type { EtlPipelineContext } from "../etl/etl-run-context";
import type { JoinQueryEtlResult } from "./join-query-internal";
export declare function resolveJoinQueryOrigins(ctx: EtlPipelineContext): string[];
export declare function callJoinQueryForEtl(joinQueryBody: Record<string, unknown>, ctx: EtlPipelineContext): Promise<JoinQueryEtlResult>;
