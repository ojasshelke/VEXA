import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as createSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from './r2';

/**
 * Generates a presigned GET URL for an object in R2.
 * Returns the public URL fallback if R2 client is not configured.
 */
export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (!r2) {
    console.warn('[avatarCache] R2 not configured, returning public URL fallback');
    return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `/models/avatar.glb`;
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  return await createSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

// Aliases for backward compat
export const getSignedAvatarUrl = getSignedUrl;

/**
 * Build the storage path for a try-on result.
 */
export function tryOnStoragePath(userId: string, productId: string): string {
  return `tryon-results/${userId}/${productId}.glb`;
}

/**
 * Uploads a file to R2 and returns its public URL.
 * Returns null if R2 is not configured.
 */
export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string | null> {
  if (!r2) {
    console.warn('[avatarCache] R2 not configured, skipping upload');
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await r2.send(command);
    return `${R2_PUBLIC_URL}/${key}`;
  } catch (err) {
    console.error('[avatarCache] Upload failed:', err);
    return null;
  }
}
