export type ExcelColumnMeta = {
    name: string;
    label: string;
    dataType: string;
    nullable: boolean;
    defaultValue: null;
    isPrimaryKey: boolean;
};
export type ExcelDataTableMetaRow = {
    physical_table_name?: string | null;
    physical_schema_name?: string | null;
    table_name?: string | null;
};
export declare function normalizeExcelDataTableRows(data: unknown): ExcelDataTableMetaRow[];
export declare function resolveExcelPhysicalTableForConnection(connectionId: string, selection: string | null | undefined, rows: ExcelDataTableMetaRow[]): string;
export declare function resolveExcelQualifiedTableFromRows(connectionId: string, selection: string | null | undefined, rows: ExcelDataTableMetaRow[], schema?: string): string;
export declare function resolveExcelPhysicalTableFromSelection(qualifiedTable: string, rows: ExcelDataTableMetaRow[]): string | null;
export type ExcelDataTableRow = {
    physical_table_name: string | null;
    physical_schema_name?: string | null;
    columns?: unknown;
    table_name?: string | null;
    import_status?: string | null;
    total_rows?: number | null;
};
export declare function resolveExcelTableName(connectionId: string, meta?: {
    physical_table_name?: string | null;
} | null): string;
export declare function parseStoredExcelColumns(columns: unknown): ExcelColumnMeta[];
export declare function loadExcelColumnsFromDb(tableName: string): Promise<ExcelColumnMeta[]>;
export declare function buildExcelMetadataTables(rows: ExcelDataTableRow[], options?: {
    fileName?: string | null;
    connectionId?: string;
}): Promise<{
    schema: string;
    name: string;
    label: string;
    columns: ExcelColumnMeta[];
}[]>;
