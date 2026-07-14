import { Queue } from "bullmq";
export declare class StorageService {
    private readonly excelQueue;
    private readonly s3;
    private readonly bucket;
    constructor(excelQueue: Queue);
    putObject(key: string, body: Buffer, contentType?: string): Promise<{
        key: string;
        bucket: string;
    }>;
    getUploadUrl(key: string, _contentType?: string): Promise<{
        url: string;
        key: string;
        bucket: string;
    }>;
    getDownloadUrl(key: string): Promise<{
        url: string;
        key: string;
    }>;
    getObjectContentLength(key: string): Promise<number | null>;
    enqueueExcelProcessing(payload: {
        connectionId: string;
        objectKey: string;
        userId: string;
    }): Promise<{
        jobId: string | undefined;
        status: string;
    }>;
}
