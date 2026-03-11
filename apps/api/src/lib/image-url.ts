import { getConfig } from '../config/index.js';

export function toPublicImageUrl(rawUrl?: string | null): string | null | undefined {
  if (!rawUrl) return rawUrl;

  // Canonical format used by current uploader.
  if (rawUrl.startsWith('/uploads/')) return rawUrl;

  // Legacy absolute URLs from MinIO/local hosts.
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrl);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return rawUrl;

      const bucket = getConfig().S3_BUCKET;
      const objectPath = parts[0] === bucket ? parts.slice(1).join('/') : parts.join('/');
      return objectPath ? `/uploads/${objectPath}` : rawUrl;
    } catch {
      return rawUrl;
    }
  }

  // Relative object path without prefix.
  const normalized = rawUrl.replace(/^\/+/, '');
  return normalized ? `/uploads/${normalized}` : rawUrl;
}
