/**
 * r2.ts — optional Cloudflare R2 storage for original uploaded files.
 *
 * R2 is S3-compatible. When not configured, `storeOriginalFile` is a no-op
 * that returns null, so uploads still work locally without object storage.
 */

import { env, isR2Configured } from "@/lib/env";

export interface StoredObject {
  key: string;
}

export async function storeOriginalFile(
  buffer: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<StoredObject | null> {
  if (!isR2Configured) return null;

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: env.r2.endpoint ?? `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2.accessKeyId!,
      secretAccessKey: env.r2.secretAccessKey!,
    },
  });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `resumes/${Date.now()}-${safeName}`;
  await client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket!,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: contentType,
    }),
  );
  return { key };
}
