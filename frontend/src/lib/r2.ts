import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function uploadToR2(file: Buffer, filename: string, contentType: string): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'vexa-assets';
  const publicUrlBase = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials in environment variables');
  }

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: filename,
    Body: file,
    ContentType: contentType,
  });

  await s3Client.send(command);

  if (!publicUrlBase) {
    throw new Error('Missing R2_PUBLIC_URL in environment variables');
  }

  const defaultBaseUrl = publicUrlBase.endsWith('/') ? publicUrlBase.slice(0, -1) : publicUrlBase;
  return `${defaultBaseUrl}/${filename}`;
}
