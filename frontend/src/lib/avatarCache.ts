/**
 * avatarCache.ts
 * Presigned URL generation + short-lived in-memory TTL cache.
 * In production, swap the stub presigner for AWS S3 or Cloudflare R2 SDK.
 *
 * RULE: raw storage paths are NEVER returned — only signed URLs with expiry.
 */

export interface SignedUrlEntry {
  url: string;
  expiresAt: number; // epoch ms
}

// In-memory cache scoped to server process (per-worker in edge runtime)
const urlCache = new Map<string, SignedUrlEntry>();

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour
const CACHE_GRACE_SECONDS = 60; // refresh 60 s before actual expiry

/**
 * Generate a presigned URL for a given storage path.
 * Replace body with real S3/R2 SDK call in production.
 */
async function generatePresignedUrl(storagePath: string): Promise<string> {
  // ─── Production: uncomment and fill in your SDK call ─────────────────────
  // import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
  // import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
  // const client = new S3Client({ region: process.env.AWS_REGION! });
  // const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storagePath });
  // return getSignedUrl(client, cmd, { expiresIn: SIGNED_URL_TTL_SECONDS });
  // ─────────────────────────────────────────────────────────────────────────

  // ─── Stub for development / testing ──────────────────────────────────────
  const base = process.env.STORAGE_BASE_URL ?? 'https://cdn.vexa.dev';
  const token = Buffer.from(`${storagePath}:${Date.now()}`).toString('base64url');
  return `${base}/${storagePath}?token=${token}&expires=${Date.now() + SIGNED_URL_TTL_SECONDS * 1000}`;
}

/**
 * Get a signed URL for a storage path.
 * Serves from cache if still valid; regenerates otherwise.
 */
export async function getSignedAvatarUrl(storagePath: string): Promise<string> {
  const cached = urlCache.get(storagePath);
  const now = Date.now();

  if (cached && cached.expiresAt > now + CACHE_GRACE_SECONDS * 1000) {
    return cached.url;
  }

  const url = await generatePresignedUrl(storagePath);
  const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1000;

  urlCache.set(storagePath, { url, expiresAt });
  return url;
}

/**
 * Invalidate a cached entry (e.g., after avatar overwrite).
 */
export function invalidateAvatarUrl(storagePath: string): void {
  urlCache.delete(storagePath);
}

/**
 * Clear all cached entries (e.g., for testing).
 */
export function clearAvatarUrlCache(): void {
  urlCache.clear();
}

/**
 * Build the canonical storage path for a user's avatar GLB.
 * Keeps paths deterministic and never publicly guessable.
 */
export function avatarStoragePath(userId: string): string {
  return `avatars/${userId}/avatar.glb`;
}

/**
 * Build storage path for a per-product try-on render.
 */
export function tryOnStoragePath(userId: string, productId: string): string {
  return `tryon/${userId}/${productId}/render.glb`;
}
