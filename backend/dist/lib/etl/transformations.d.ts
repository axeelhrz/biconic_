export type CastTargetType = "number" | "integer" | "decimal" | "string" | "boolean" | "date" | "datetime";
export declare function getValue(row: Record<string, any>, colName: string): any;
export declare function buildRegexFromPattern(pattern: string): {
    regex: RegExp;
    groups: {
        token: string;
    }[];
};
export declare function parseDateWithPattern(value: string, pattern?: string): Date | null;
export declare function inferColumnTypes(rows: Record<string, any>[], columnNames?: string[]): Array<{
    column: string;
    inferredType: CastTargetType;
}>;
export declare function applyArithmeticOperations(rows: Record<string, any>[], config: {
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
}): Record<string, any>[];
export type CleanTransform = {
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
    op: "normalize_spaces";
} | {
    column: string;
    op: "strip_invisible";
} | {
    column: string;
    op: "utf8_normalize";
};
export type CleanConfig = {
    transforms: CleanTransform[];
    dedupe?: {
        keyColumns: string[];
        keep: "first" | "last";
    };
};
export declare function applyTransforms(row: Record<string, any>, config: {
    transforms: CleanTransform[];
} | undefined): Record<string, any>;
export declare function applyDedupe(rows: Record<string, any>[], keyColumns: string[], keep: "first" | "last"): Record<string, any>[];
export declare function applyCleanBatch(rows: Record<string, any>[], config: CleanConfig | undefined): Record<string, any>[];
export declare function applyCastConversions(rows: Record<string, any>[], config: {
    conversions: Array<{
        column: string;
        targetType: CastTargetType;
        inputFormat?: string | null;
        outputFormat?: string | null;
    }>;
}): Record<string, any>[];
export declare function applyConditionRules(rows: Record<string, any>[], config: {
    resultColumn?: string;
    defaultResultValue?: string;
    rules: Array<{
        id: string;
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
}): Record<string, any>[];
export declare function applyCountAggregation(rows: Record<string, any>[], config: {
    attribute: string;
    resultColumn?: string;
}): Record<string, any>[];
