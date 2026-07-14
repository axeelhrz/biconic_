import type { GeoCacheClient } from "../geo/geo-enrichment";
import type { AggregateDataDeps } from "./aggregateDataHandler";
export declare function createAggregateDataDeps(options: {
    userId?: string | null;
    requireAuth?: boolean;
    databaseUrl?: string;
    geoCacheClient?: GeoCacheClient | null;
}): AggregateDataDeps;
export declare function createPgAggregateDataDeps(options: {
    userId?: string | null;
    requireAuth?: boolean;
    databaseUrl: string;
    geoCacheClient?: GeoCacheClient | null;
}): AggregateDataDeps;
