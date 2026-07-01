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
export declare function ensureDataTablesForSheets(supabaseAdmin: any, connectionId: string, sheetNames: string[], initialDataTableId: string): Promise<SheetTableMapping[]>;
export declare function excelConnectionTableKeys(mappings: SheetTableMapping[]): string[];
