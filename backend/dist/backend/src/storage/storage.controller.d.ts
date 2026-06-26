import type { Request } from "express";
import { StorageService } from "./storage.service";
export declare class StorageController {
    private readonly storage;
    constructor(storage: StorageService);
    uploadUrl(body: {
        key: string;
        contentType: string;
    }): Promise<{
        url: string;
        key: string;
        bucket: string;
    }>;
    downloadUrl(body: {
        key: string;
    }): Promise<{
        url: string;
        key: string;
    }>;
    internalDownloadUrl(body: {
        key: string;
    }, req: Request & {
        headers: Record<string, string | string[] | undefined>;
    }): Promise<{
        url: string;
        key: string;
    }>;
    processExcel(body: {
        connectionId: string;
        objectKey: string;
    }, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<{
        jobId: string | undefined;
        status: string;
    }>;
}
