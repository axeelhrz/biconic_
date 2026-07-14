import { type ParseMode } from "../../../lib/excel-import/process-data-import";
export declare class ExcelImportInternalController {
    runImport(body: {
        connectionId?: string;
        dataTableId?: string;
        parseMode?: ParseMode;
        selectedSheet?: string | null;
        continuation?: boolean;
        forceReimport?: boolean;
    }, internalSecret?: string): Promise<{
        ok: boolean;
        status: string;
    }>;
}
