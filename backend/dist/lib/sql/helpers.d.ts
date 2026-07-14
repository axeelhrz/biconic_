export type FilterCondition = {
    column: string;
    operator: "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "startsWith" | "endsWith" | "in" | "not in" | "is null" | "is not null";
    value?: string;
};
export type JoinCondition = {
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
};
export declare function quoteIdent(name: string, dbType?: "postgres" | "mysql"): string;
export declare function quoteQualified(qname: string, dbType?: "postgres" | "mysql"): string;
export declare function buildJoinClauseBinary(joinConditions: JoinCondition[], dbType: "postgres" | "mysql", rightQualified: string): string;
export declare function buildWhereClausePg(conds?: FilterCondition[]): {
    clause: string;
    params: any[];
};
export type DateFilterSpec = {
    column: string;
    years?: number[];
    months?: number[];
    exactDates?: string[];
};
export declare function buildDateFilterWhereFragmentPg(dateFilter: DateFilterSpec | undefined | null, paramStartIndex: number, tablePrefix?: string, joinsCount?: number): {
    clause: string;
    params: any[];
};
export declare function buildDateFilterWhereFragmentFirebird(dateFilter: DateFilterSpec | undefined | null): {
    clause: string;
    params: any[];
};
export declare function buildWhereClauseMy(conds?: FilterCondition[]): {
    clause: string;
    params: any[];
};
export declare function buildWhereClauseFirebird(conds?: FilterCondition[]): {
    clause: string;
    params: any[];
};
export declare function buildWhereClauseFirebirdStar(conds: FilterCondition[] | undefined, joinsCount: number, strictPrefixed?: boolean): {
    clause: string;
    params: any[];
};
export declare function buildDateFilterWhereFragmentFirebirdStar(dateFilter: DateFilterSpec | undefined | null, joinsCount: number): {
    clause: string;
    params: any[];
};
export declare function buildWhereClausePgStar(conds: FilterCondition[] | undefined, joinsCount: number, strictPrefixed?: boolean): {
    clause: string;
    params: any[];
};
export declare function buildWhereClauseMyStar(conds: FilterCondition[] | undefined, joinsCount: number, strictPrefixed?: boolean): {
    clause: string;
    params: any[];
};
