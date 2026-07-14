export declare function ensureExcelUploadDir(): string;
export declare function buildExcelStoragePath(userId: string, fileExt: string): string;
export declare function getLocalExcelAbsolutePath(storagePath: string): string;
export declare function hasLocalExcelFile(storagePath: string): boolean;
export declare function saveExcelFileLocal(storagePath: string, bytes: Buffer): Promise<string>;
export declare function getExcelFileServeUrl(storagePath: string, origin?: string): string;
