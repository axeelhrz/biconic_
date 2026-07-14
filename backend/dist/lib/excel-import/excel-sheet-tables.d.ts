export declare function buildSheetPhysicalTableName(connectionId: string, sheetName: string, sheetIndex: number, usedNames?: Set<string>): string;
export type SheetTableMapping = {
    sheetName: string;
    dataTableId: string;
    physicalTableName: string;
};
export declare function loadWorkbookBufferForConnection(storagePath: string, originalFileName: string | null | undefined, options?: {
    cookieHeader?: string | null;
    internal?: boolean;
}): Promise<Buffer>;
export declare function listSheetNamesFromBuffer(buffer: Buffer, storagePath: string, originalFileName?: string | null): string[];
export declare function listSheetNamesForConnection(connectionId: string, supabaseAdmin: {
    from: (table: string) => unknown;
}, options?: {
    cookieHeader?: string | null;
    internal?: boolean;
}): Promise<{
    sheetNames: string[];
    storagePath: string;
    originalFileName: string | null;
}>;
export type ImportSheetResolution = {
    mode: "single";
    sheetName: string;
    sheetNames: string[];
} | {
    mode: "all";
    sheetNames: string[];
};
export declare function resolveImportSheetSelection(connectionId: string, selectedSheet: string | null | undefined, supabaseAdmin: {
    from: (table: string) => unknown;
}, options?: {
    cookieHeader?: string | null;
    internal?: boolean;
}): Promise<ImportSheetResolution>;
export declare function ensureDataTablesForSheets(supabaseAdmin: any, connectionId: string, sheetNames: string[], initialDataTableId: string): Promise<SheetTableMapping[]>;
export declare function excelConnectionTableKeys(mappings: SheetTableMapping[]): string[];
