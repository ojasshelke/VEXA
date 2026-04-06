export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  // TODO: generate R2 presigned URL
  throw new Error('Not implemented')
}
export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  // TODO: upload file to R2, return public URL
  throw new Error('Not implemented')
}
