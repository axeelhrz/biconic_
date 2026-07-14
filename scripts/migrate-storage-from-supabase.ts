#!/usr/bin/env tsx
/**
 * Copia objetos de Supabase Storage a MinIO (one-shot, pre-cutover).
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   S3_ENDPOINT=http://localhost:9000 \
 *   S3_ACCESS_KEY=biconic \
 *   S3_SECRET_KEY=biconic_minio_password \
 *   pnpm migrate:storage
 *
 * Buckets: excel-uploads, avatars
 */

import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } =
  require(join(process.cwd(), "backend/node_modules/@aws-sdk/client-s3")) as typeof import("@aws-sdk/client-s3");

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKETS = ["excel-uploads", "avatars"];

async function listSupabaseObjects(bucket: string): Promise<string[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos para migración");
  }
  const keys: string[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/list/${bucket}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: "", limit, offset }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List ${bucket} failed (${res.status}): ${text}`);
    }
    const batch = (await res.json()) as Array<{ name: string }>;
    if (!batch.length) break;
    for (const item of batch) {
      if (item.name) keys.push(item.name);
    }
    if (batch.length < limit) break;
    offset += limit;
  }
  return keys;
}

async function downloadSupabaseObject(bucket: string, key: string): Promise<Buffer> {
  const url = `${SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Download ${bucket}/${key} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "biconic",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "biconic_minio_password",
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
}

async function ensureBucket(s3: S3Client, bucket: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function main() {
  const s3 = getS3Client();
  let total = 0;

  for (const bucket of BUCKETS) {
    console.log(`\n=== Bucket: ${bucket} ===`);
    await ensureBucket(s3, bucket);
    const keys = await listSupabaseObjects(bucket);
    console.log(`Objetos encontrados: ${keys.length}`);

    for (const key of keys) {
      const body = await downloadSupabaseObject(bucket, key);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
        })
      );
      total++;
      if (total % 50 === 0) console.log(`  Copiados: ${total}`);
    }
  }

  console.log(`\nMigración completada: ${total} objetos copiados a MinIO.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
