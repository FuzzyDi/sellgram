import { Client as MinioClient } from 'minio';
import { getConfig } from '../config/index.js';

let s3Client: MinioClient;

export function getS3(): MinioClient {
  if (!s3Client) {
    const config = getConfig();
    const url = new URL(config.S3_ENDPOINT);
    s3Client = new MinioClient({
      endPoint: url.hostname,
      port: parseInt(url.port) || 9000,
      useSSL: url.protocol === 'https:',
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
    });
  }
  return s3Client;
}

export async function ensureBucket(): Promise<void> {
  const bucket = getConfig().S3_BUCKET;
  const client = getS3();
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, getConfig().S3_REGION);
  }
}

export async function uploadFile(
  fileName: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const bucket = getConfig().S3_BUCKET;
  await getS3().putObject(bucket, fileName, data, data.length, {
    'Content-Type': contentType,
  });
  return `/uploads/${fileName}`;
}

export function resolveBucketAndObjectPath(rawPath: string): { bucket: string; objectPath: string } {
  const normalized = rawPath.replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === '..')) {
    throw new Error('Invalid object path');
  }

  const defaultBucket = getConfig().S3_BUCKET;
  const explicitBucket = segments[0] === defaultBucket ? segments[0] : null;
  const objectPath = explicitBucket ? segments.slice(1).join('/') : normalized;

  if (!objectPath || objectPath.includes('..')) {
    throw new Error('Invalid object path');
  }

  return {
    bucket: defaultBucket,
    objectPath,
  };
}

export function buildProductImageObjectPath(tenantId: string, productId: string, fileName: string): string {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  return `products/${safeTenantId}/${safeProductId}/${safeFileName}`;
}

export function buildBannerObjectPath(tenantId: string, fileName: string): string {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  return `banners/${safeTenantId}/${safeFileName}`;
}
