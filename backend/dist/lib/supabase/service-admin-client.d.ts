import postgres from "postgres";
export declare function getServiceDbUrl(): string;
export type QueryResult = {
    data: any;
    error: {
        message: string;
        code?: string;
    } | null;
    count?: number | null;
};
export declare class PostgresServiceQuery {
    private readonly sql;
    private readonly table;
    private readonly schema;
    private filters;
    private orClause;
    private selectCols;
    private isUpdate;
    private isInsert;
    private isUpsert;
    private upsertConflictCol?;
    private isDelete;
    private updatePayload;
    private insertPayload;
    private insertReturning;
    private wantSingle;
    private wantThrow;
    private orderCol?;
    private orderAsc;
    private nullsFirst;
    private limitN?;
    private offsetN?;
    private countHead;
    constructor(sql: ReturnType<typeof postgres>, table: string, schema?: string);
    private qualifiedTable;
    select(cols?: string, opts?: {
        count?: "exact";
        head?: boolean;
    }): this;
    insert(payload: Record<string, unknown> | Record<string, unknown>[]): this;
    upsert(payload: Record<string, unknown> | Record<string, unknown>[], opts?: {
        onConflict?: string;
    }): this;
    update(payload: Record<string, unknown>): this;
    eq(col: string, val: unknown): this;
    ilike(col: string, val: unknown): this;
    in(col: string, val: unknown[]): this;
    lt(col: string, val: unknown): this;
    gt(col: string, val: unknown): this;
    gte(col: string, val: unknown): this;
    or(filter: string): this;
    neq(col: string, val: unknown): this;
    is(col: string, val: null): this;
    order(col?: string, opts?: {
        ascending?: boolean;
        nullsFirst?: boolean;
    }): this;
    limit(n: number): this;
    range(from: number, to: number): this;
    delete(): this;
    single(): this;
    maybeSingle(): this;
    throwOnError(): this;
    then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    private buildWhere;
    private execute;
}
export type ServiceAdminClient = {
    from: (table: string) => PostgresServiceQuery;
    schema: (schemaName: string) => {
        from: (table: string) => PostgresServiceQuery;
    };
    _sql?: ReturnType<typeof postgres>;
};
export declare function createServiceAdminClient(): ServiceAdminClient;
export declare function createServiceRoleOrAdminClient(): ServiceAdminClient;
