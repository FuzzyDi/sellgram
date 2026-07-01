import { Client as MinioClient } from 'minio';
import { getConfig } from '../config/index.js';

let s3Client: MinioClient;

export function getS3(): MinioClient {
  if (!s3Client) {
    const config = getConfig();
    const url = new URL(config.S3_ENDPOINT);
    s3Client = new MinioClient({
      endPoint: url.hostname,
      port: parseInt(url.port, 10) || 9000,
      useSSL: url.protocol === 'https:',
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
    });
  }
  return s3Client;
}
