import { Queue } from "bullmq";
export declare class StorageService {
    private readonly excelQueue;
    private readonly s3;
    private readonly bucket;
    constructor(excelQueue: Queue);
    getUploadUrl(key: string, contentType: string): Promise<{
        url: string;
        key: string;
        bucket: string;
    }>;
    getDownloadUrl(key: string): Promise<{
        url: string;
        key: string;
    }>;
    enqueueExcelProcessing(payload: {
        connectionId: string;
        objectKey: string;
        userId: string;
    }): Promise<{
        jobId: string | undefined;
        status: string;
    }>;
}
