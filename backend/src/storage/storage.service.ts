import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { EXCEL_QUEUE } from "../etl/etl.constants";

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@InjectQueue(EXCEL_QUEUE) private readonly excelQueue: Queue) {
    const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
    this.bucket = process.env.S3_BUCKET ?? "excel-uploads";
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "biconic",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "biconic_minio_password",
      },
    });
  }

  async putObject(key: string, body: Buffer, contentType?: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...(contentType ? { ContentType: contentType } : {}),
      })
    );
    return { key, bucket: this.bucket };
  }

  async getUploadUrl(key: string, _contentType?: string) {
    // Sin ContentType en la firma: el navegador no debe enviar headers extra en el PUT
    // (evita 403 por mismatch y simplifica CORS en R2).
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return { url, key, bucket: this.bucket };
  }

  async getDownloadUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return { url, key };
  }

  async enqueueExcelProcessing(payload: {
    connectionId: string;
    objectKey: string;
    userId: string;
  }) {
    const job = await this.excelQueue.add("import", payload, {
      removeOnComplete: 50,
      removeOnFail: 20,
    });
    return { jobId: job.id, status: "queued" };
  }
}
