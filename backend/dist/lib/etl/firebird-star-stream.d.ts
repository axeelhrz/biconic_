import { type DateFilterSpec } from "../sql/helpers";
type FilterCondition = {
    column: string;
    operator: string;
    value?: string;
};
type StarJoinSpec = {
    secondaryTable?: string;
    secondaryColumns?: string[];
    joinType?: string;
    conditions?: Array<{
        primaryColumn?: string;
        secondaryColumn?: string;
    }>;
    primaryColumn?: string;
    secondaryColumn?: string;
};
export type FirebirdStarStreamOptions = {
    attachOptions: Record<string, unknown>;
    primaryTable: string;
    primaryColumns: string[];
    joins: StarJoinSpec[];
    conditions: FilterCondition[];
    dateFilter?: DateFilterSpec | null;
    batchSize?: number;
    onProgress?: (rowsSoFar: number) => void;
};
export declare function buildFirebirdStarStreamSql(opts: FirebirdStarStreamOptions): string;
export declare function streamFirebirdStarJoin(opts: FirebirdStarStreamOptions): AsyncGenerator<Record<string, unknown>[], void, void>;
export {};
