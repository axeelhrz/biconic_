export interface DerivedColumnRef {
    name: string;
    expression: string;
    defaultAggregation: string;
}
export declare function quotedColumn(name: string): string;
export declare function splitArgs(content: string): string[];
export declare function ifsYieldsOnlyTextLiterals(expression: string): boolean;
export declare function coerceAggFuncForTextOnlyIFS(func: string, expression: string): string;
export declare function expressionToSql(expression: string, derivedLookup?: Record<string, DerivedColumnRef>, _depth?: number): string | null;
export declare function resolveFieldToSql(field: string, derivedLookup?: Record<string, DerivedColumnRef>): string | null;
