import { type InferredColumnFormat } from "../derive-column-types";
import type { DateGranularity } from "../dashboard/dateFormatting";
export type DateTransform = "none" | "day" | "week" | "month" | "quarter" | "year";
export type ComparativeValueType = "absolute" | "percent";
export type ComparativeFieldMapping = {
    id: string;
    comparativeColumn: string;
    baseColumn: string;
    baseDateTransform?: DateTransform;
};
export type ComparativeMeasureField = {
    column: string;
    valueType: ComparativeValueType;
    label?: string;
};
export type ComparativeRelationValidation = {
    status: "ok" | "blocked" | "warning";
    duplicates?: {
        count: number;
        sampleKeys?: string[];
    };
    baseWithoutMatch?: {
        count: number;
    };
    comparativeWithoutBase?: {
        count: number;
    };
    validatedAt: string;
};
export type ComparativeRelation = {
    id: string;
    name: string;
    comparativeDatasetId: string;
    comparativeDatasetName?: string;
    fieldMappings: ComparativeFieldMapping[];
    comparisonLevel: string[];
    comparativeFields: ComparativeMeasureField[];
    validation?: ComparativeRelationValidation;
};
export declare function isDateTransform(v: unknown): v is DateTransform;
export declare function deriveComparisonLevel(mappings: ComparativeFieldMapping[]): string[];
export declare function detectComparativeValueType(columnName: string, sampleValues?: unknown[]): ComparativeValueType;
export declare function isComparativeMeasureCandidate(params: {
    columnName: string;
    role?: string;
    inferredType?: string;
    format?: InferredColumnFormat;
}): boolean;
export declare function granularityRank(value: DateTransform | DateGranularity | "none" | undefined): number;
export declare function isAnalysisFinerThanComparisonLevel(params: {
    analysisDimensions: string[];
    analysisDateGranularity?: DateGranularity;
    comparisonLevel: string[];
    fieldMappings: ComparativeFieldMapping[];
    timeColumn?: string;
}): boolean;
export declare function comparativeOutputColumns(metricAlias: string, valueType: ComparativeValueType): string[];
export declare function parseComparativeFieldMapping(raw: unknown): ComparativeFieldMapping | null;
export declare function parseComparativeMeasureField(raw: unknown): ComparativeMeasureField | null;
export declare function parseComparativeRelation(raw: unknown): ComparativeRelation | null;
export declare function parseComparativeRelationsFromConfig(config: unknown): ComparativeRelation[];
export declare function findComparativeRelation(config: unknown, relationId: string): ComparativeRelation | null;
export declare function sqlDateTruncExpr(columnSql: string, transform: DateTransform): string;
export declare function quoteSqlIdentifier(name: string): string;
