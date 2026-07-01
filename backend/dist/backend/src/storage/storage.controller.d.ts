import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { StorageService } from "./storage.service";
type MulterUploadedFile = {
    buffer: Buffer;
    mimetype?: string;
    size?: number;
};
export declare class StorageController {
    private readonly storage;
    private readonly jwt;
    constructor(storage: StorageService, jwt: JwtService);
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
    directUpload(file: MulterUploadedFile | undefined, storagePath: string, connectionId: string, uploadToken: string | undefined): Promise<{
        ok: boolean;
        key: string;
        bytesUploaded: number;
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
export {};
