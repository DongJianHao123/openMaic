/**
 * Tencent Cloud COS Storage Provider
 *
 * Uses the existing oss.ts utility to upload files to Tencent Cloud COS
 * Base URL: https://oss.opencamp.cn/file/
 */

import type { StorageProvider, StorageType } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('COSStorageProvider');

// Base URL for COS files
const COS_BASE_URL = 'https://oss.opencamp.cn/file/';

/**
 * Generate a unique key for storage
 */
function generateStorageKey(hash: string, type: StorageType): string {
  const prefix = type === 'media' ? 'media' : type === 'poster' ? 'poster' : 'audio';
  return `${prefix}/${hash}`;
}

/**
 * Convert Blob to File for upload
 */
function blobToFile(blob: Blob, filename: string, mimeType?: string): File {
  return new File([blob], filename, { type: mimeType || blob.type });
}

/**
 * Get file extension from mime type
 */
function getExtensionFromMime(mimeType?: string): string {
  if (!mimeType) return 'bin';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return map[mimeType] || 'bin';
}

export class COSStorageProvider implements StorageProvider {
  private uploadCache = new Map<string, string>();

  /**
   * Upload a blob to COS storage
   * Returns the public URL
   */
  async upload(
    hash: string,
    blob: Buffer,
    type: StorageType,
    mimeType?: string,
  ): Promise<string> {
    // Check cache first
    const cachedUrl = this.uploadCache.get(hash);
    if (cachedUrl) {
      log.info('Using cached URL for:', hash);
      return cachedUrl;
    }

    // Check if already exists (by checking if we can get a URL)
    const existingUrl = await this.getUrlIfExists(hash, type);
    if (existingUrl) {
      log.info('File already exists in COS:', hash);
      this.uploadCache.set(hash, existingUrl);
      return existingUrl;
    }

    try {
      log.info('Uploading to COS:', hash, type);

      // Dynamically import the oss.ts utilities
      // This avoids issues with client-side only code in server contexts
      const { fileUpload } = await import('@/lib/utils/oss');

      // Convert Buffer to Blob, then to File
      const nodeBuffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      const blobObj = new Blob([nodeBuffer as unknown as BlobPart], { type: mimeType });
      const ext = getExtensionFromMime(mimeType);
      const storageKey = generateStorageKey(hash, type);
      const filename = `${storageKey}.${ext}`;
      const file = blobToFile(blobObj, filename, mimeType);

      // Upload using the existing fileUpload function
      const url = await fileUpload(file, (progress) => {
        log.debug(`Upload progress for ${hash}: ${Math.round(progress * 100)}%`);
      });

      log.info('Uploaded successfully:', url);
      this.uploadCache.set(hash, url);
      return url;
    } catch (error) {
      log.error('Failed to upload to COS:', error);
      throw error;
    }
  }

  /**
   * Check if a file already exists in COS
   * Note: This is a best-effort check by trying to access the URL
   */
  async exists(hash: string, type: StorageType): Promise<boolean> {
    const url = await this.getUrlIfExists(hash, type);
    return !!url;
  }

  /**
   * Try to get URL if file exists (HEAD request)
   */
  private async getUrlIfExists(hash: string, type: StorageType): Promise<string | null> {
    const url = this.getUrl(hash, type);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the public URL for a given hash
   */
  getUrl(hash: string, type: StorageType): string {
    const storageKey = generateStorageKey(hash, type);
    return `${COS_BASE_URL}${storageKey}`;
  }

  /**
   * Batch check which hashes exist
   */
  async batchExists(hashes: string[], type: StorageType): Promise<Set<string>> {
    const results = new Set<string>();
    // Check in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < hashes.length; i += concurrency) {
      const batch = hashes.slice(i, i + concurrency);
      const promises = batch.map((hash) => this.exists(hash, type));
      const exists = await Promise.all(promises);
      batch.forEach((hash, index) => {
        if (exists[index]) {
          results.add(hash);
        }
      });
    }
    return results;
  }
}
