import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

/**
 * Cloudflare R2 client and upload helper.
 *
 * IMPORTANT: R2 creds are optional in dev. All callers must handle
 * null returns gracefully (e.g. fall back to base64 data URLs).
 */

let r2Client: S3Client | null = null

try {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (accountId && accessKeyId && secretAccessKey) {
    const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    })
  } else {
    console.warn('[r2] R2 credentials not configured — uploads will return null')
  }
} catch (err) {
  console.warn('[r2] Failed to initialize R2 client:', err)
}

export const r2 = r2Client
export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'vexa-assets'
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

/**
 * Upload a buffer to R2 and return the public URL.
 * Returns null on any failure — callers must handle null gracefully.
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<string | null> {
  try {
    if (!r2Client) {
      console.warn('[r2] No R2 client — skipping upload for key:', key)
      return null
    }

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )

    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : null
    console.log('[r2] Uploaded:', key, '→', publicUrl)
    return publicUrl
  } catch (err) {
    console.error('[r2] Upload failed (returning null):', err)
    return null
  }
}
