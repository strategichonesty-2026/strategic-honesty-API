const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');

// Same bucket/credentials strategic-honesty-media-studio-v2 already uses for
// all its generated images/videos — permanent storage, not a local temp
// file. A local temp file on this service can never be reliably long-lived:
// Railway wipes a service's local disk on every deploy, and this service
// gets deployed often. Media handed to Buffer/Postiz needs to survive until
// the actual scheduled post time (hours/days/weeks out), which a 30-minute
// local file (or one that dies on the next `git push`) cannot guarantee.
function client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const BUCKET = () => process.env.R2_BUCKET_NAME;
const PUBLIC_URL_BASE = () => (process.env.R2_PUBLIC_URL_BASE || '').trim();

async function uploadBufferToR2(buffer, extension, contentType) {
  if (!process.env.R2_ACCOUNT_ID || !BUCKET() || !PUBLIC_URL_BASE()) {
    throw new Error('R2 environment variables not configured on this service');
  }
  const key = `prepared/${randomUUID()}.${extension}`;
  await client().send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${PUBLIC_URL_BASE().replace(/\/$/, '')}/${key}`;
}

module.exports = { uploadBufferToR2 };
