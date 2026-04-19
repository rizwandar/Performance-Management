const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Upload a file buffer to R2.
 * Returns the r2_key (path in the bucket).
 */
async function uploadFile({ key, buffer, mimeType }) {
  await client.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));
  return key;
}

/**
 * Generate a signed download URL valid for 1 hour.
 */
async function getDownloadUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

/**
 * Delete a file from R2.
 */
async function deleteFile(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Download a file from R2 as a Buffer.
 * Used for embedding files (e.g. logo) in PDF generation.
 */
async function getFileBuffer(key) {
  const response = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = { uploadFile, getDownloadUrl, deleteFile, getFileBuffer };
