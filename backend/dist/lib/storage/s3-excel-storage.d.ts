import { Readable } from "stream";
export declare function getS3BucketName(): string;
export declare function isS3Configured(): boolean;
export declare function isVercelRuntime(): boolean;
export declare const VERCEL_SAFE_UPLOAD_BYTES: number;
export declare function shouldUseDirectS3Upload(fileSize: number): boolean;
export declare function getPresignedUploadUrl(key: string, contentType: string, cookieHeader?: string | null): Promise<{
    url: string;
    key: string;
}>;
export declare function getPresignedDownloadUrl(key: string, options?: {
    cookieHeader?: string | null;
    internal?: boolean;
}): Promise<string>;
export declare function getS3ObjectContentLength(key: string): Promise<number | null>;
export declare function getS3ObjectReadableStream(key: string): Promise<Readable>;
export declare function fetchExcelBytesFromStorage(storagePath: string, options?: {
    cookieHeader?: string | null;
    internal?: boolean;
}): Promise<Buffer>;
export declare function excelContentType(fileName: string): string;
