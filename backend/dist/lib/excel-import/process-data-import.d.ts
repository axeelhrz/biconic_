type ParseMode = "strict" | "tolerant" | "mixed";
export type { ParseMode };
export type ProcessExcelImportInput = {
    connectionId: string;
    dataTableId: string;
    parseMode: ParseMode;
    selectedSheet: string | null;
    continuation?: boolean;
    forceReimport?: boolean;
    cookieHeader?: string | null;
};
export declare function runProcessExcelImport(input: ProcessExcelImportInput): Promise<void>;
