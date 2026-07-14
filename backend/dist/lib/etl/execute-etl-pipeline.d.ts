import { type DateFilterSpec } from "../sql/helpers";
import { type EtlPipelineContext } from "./etl-run-context";
type FilterCondition = {
    column: string;
    operator: "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "startsWith" | "endsWith" | "in" | "not in" | "is null" | "is not null";
    value?: string;
};
type JoinCondition = {
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
};
export type RunBody = {
    etlId?: string;
    connectionId?: string;
    filter?: {
        table?: string;
        columns?: string[];
        conditions?: FilterCondition[];
        dateFilter?: DateFilterSpec;
    };
    join?: {
        connectionId: string;
        secondaryConnectionId?: string;
        leftTable: string;
        rightTable: string;
        joinConditions: JoinCondition[];
        leftColumns?: string[];
        rightColumns?: string[];
    };
    union?: {
        left: {
            connectionId: string;
            filter?: {
                table?: string;
                columns?: string[];
                conditions?: FilterCondition[];
            };
        };
        right?: {
            connectionId: string;
            filter?: {
                table?: string;
                columns?: string[];
                conditions?: FilterCondition[];
            };
        };
        rights?: Array<{
            connectionId: string;
            filter?: {
                table?: string;
                columns?: string[];
                conditions?: FilterCondition[];
            };
        }>;
        unionAll?: boolean;
    };
    clean?: {
        transforms: Array<{
            column: string;
            op: "trim" | "upper" | "lower" | "cast_number" | "cast_date";
        } | {
            column: string;
            op: "replace";
            find: string;
            replaceWith: string;
        } | {
            column: string;
            op: "replace_value";
            find: string;
            replaceWith: string;
        } | {
            column: string;
            op: "normalize_nulls";
            patterns: string[];
            action: "null" | "replace";
            replacement?: string;
        } | {
            column: string;
            op: "normalize_spaces" | "strip_invisible" | "utf8_normalize";
        }>;
        dedupe?: {
            keyColumns: string[];
            keep: "first" | "last";
        };
    };
    cast?: {
        conversions: Array<{
            column: string;
            targetType: "number" | "integer" | "decimal" | "string" | "boolean" | "date" | "datetime";
            inputFormat?: string | null;
            outputFormat?: string | null;
        }>;
    };
    count?: {
        attribute: string;
        resultColumn?: string;
    };
    arithmetic?: {
        operations: Array<{
            id: string;
            leftOperand: {
                type: "column" | "constant";
                value: string;
            };
            operator: "+" | "-" | "*" | "/" | "%" | "^" | "pct_of" | "pct_off";
            rightOperand: {
                type: "column" | "constant";
                value: string;
            };
            resultColumn: string;
        }>;
    };
    condition?: {
        resultColumn?: string;
        defaultResultValue?: string;
        rules: Array<{
            id: string;
            column?: string;
            operator?: string;
            value?: string | number | boolean;
            outputValue?: string;
            outputColumn?: string;
            leftOperand?: {
                type: "column" | "constant";
                value: string;
            };
            rightOperand?: {
                type: "column" | "constant";
                value: string;
            };
            comparator?: string;
            resultColumn?: string;
            outputType?: "boolean" | "string" | "number";
            thenValue?: string;
            elseValue?: string;
            shouldFilter?: boolean;
        }>;
    };
    pipeline?: Array<{
        type: "clean" | "cast" | "arithmetic" | "condition";
        config: any;
    }>;
    end?: {
        target: {
            type: "supabase";
            table: string;
        };
        mode: "overwrite" | "append" | "replace";
    };
    preview?: boolean;
    waitForCompletion?: boolean;
    _resumeStartOffset?: number;
    _resumeAttempt?: number;
    schedule?: {
        frequency?: string;
        lastRunAt?: string;
    };
    runId?: string;
    userId?: string;
    asyncWorker?: boolean;
};
export declare function ensureRunTerminalState(supabaseAdmin: any, runId: string, status: "completed" | "failed", payload: {
    completed_at: string;
    rows_processed?: number;
    error_message?: string;
}): Promise<void>;
export declare function markStaleRunsForEtl(supabaseAdmin: any, etlId: string): Promise<void>;
export declare function executeEtlPipeline(body: RunBody, runId: string, supabaseAdmin: any, user: any, ctx: EtlPipelineContext): Promise<number>;
export {};
