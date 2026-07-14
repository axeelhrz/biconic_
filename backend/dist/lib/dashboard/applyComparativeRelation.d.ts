import type { CompareSpec } from "./compareSpec";
import { type ParseDateLikeOptions } from "./dateFormatting";
import type { ComparativeFieldMapping, ComparativeRelation, ComparativeValueType } from "../dataset/comparativeRelation";
export declare function buildComparativeJoinKey(row: Record<string, unknown>, mappings: ComparativeFieldMapping[], side: "base" | "comparative", parseOpts?: ParseDateLikeOptions): string;
export declare function applyComparativeRelationToRows(params: {
    baseRows: Record<string, unknown>[];
    comparativeRows: Record<string, unknown>[];
    relation: ComparativeRelation;
    compareSpec: Extract<CompareSpec, {
        kind: "comparative";
    }>;
    metricAliases: string[];
    parseOpts?: ParseDateLikeOptions;
}): Record<string, unknown>[];
export declare function buildComparativeAggregateSql(params: {
    schema: string;
    tableName: string;
    relation: ComparativeRelation;
    comparativeField: string;
    valueType: ComparativeValueType;
}): string;
