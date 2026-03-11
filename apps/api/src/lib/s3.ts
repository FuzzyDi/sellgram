import { Client as MinioClient } from 'minio';
import { getConfig } from '../config/index.js';

let s3Client: MinioClient;
const LEGACY_S3_BUCKETS = ['sellgram', 'shopbot'] as const;

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
  // Return proxy URL (served by /uploads/* route)
  return `/uploads/${fileName}`;
}

export function resolveBucketAndObjectPath(rawPath: string): { bucket: string; objectPath: string } {
  const normalized = rawPath.replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  const defaultBucket = getConfig().S3_BUCKET;
  const bucketCandidates = Array.from(new Set([defaultBucket, ...LEGACY_S3_BUCKETS]));
  const maybeBucket = segments[0];
  const explicitBucket = bucketCandidates.includes(maybeBucket as typeof bucketCandidates[number]) ? maybeBucket : null;

  return {
    bucket: explicitBucket ?? defaultBucket,
    objectPath: explicitBucket ? segments.slice(1).join('/') : normalized,
  };
}
