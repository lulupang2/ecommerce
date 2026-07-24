const { eq } = require('drizzle-orm');
const { S3Client, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { database } = require('@techzone/database/db');
const { mediaAssets } = require('@techzone/database/schema');
const { server, listen } = require('@techzone/config/http');
const { requireAuth, requireRole } = require('@techzone/auth-platform/auth');

const db = database('media');
const app = server('media');
const bucket = process.env.S3_BUCKET || 'techzone-media';
const endpoint = process.env.S3_ENDPOINT || '';
const s3 = endpoint ? new S3Client({ endpoint, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin', secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin' } }) : null;
const allowedImages = new Map([
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
]);

async function init() {
  await db.wait();
  await db.query(`CREATE TABLE IF NOT EXISTS media_assets (id UUID PRIMARY KEY,owner_id UUID,content_type TEXT NOT NULL,object_key TEXT NOT NULL,public_url TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())`);
  if (s3) { try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); } catch (error) { if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)) console.warn('S3 bucket setup:', error.message); } }
}

app.post('/media/upload-url', requireAuth, requireRole('admin'), async (req, res) => {
  const { contentType = 'image/jpeg', fileName = 'asset.jpg' } = req.body || {};
  const extension = String(fileName).split('.').pop().toLowerCase();
  if (!allowedImages.get(contentType)?.has(extension)) {
    return res.status(400).json({ code: 'INVALID_MEDIA_TYPE', message: 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.' });
  }
  const ownerId = req.user.sub;
  const id = crypto.randomUUID();
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  const objectKey = `uploads/${ownerId || 'anonymous'}/${id}-${safeName}`;
  let uploadUrl = `${process.env.S3_PUBLIC_ENDPOINT || endpoint || 'https://storage.example.invalid'}/${bucket}/${objectKey}`;
  let publicUrl = uploadUrl;
  if (s3) { uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }), { expiresIn: 900 }); const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint; if (publicEndpoint && endpoint && publicEndpoint !== endpoint) uploadUrl = uploadUrl.replace(endpoint, publicEndpoint); publicUrl = `${publicEndpoint}/${bucket}/${objectKey}`; }
  await db.orm.insert(mediaAssets).values({ id, ownerId: ownerId || null, contentType, objectKey, publicUrl });
  res.status(201).json({ assetId: id, uploadUrl, publicUrl, expiresIn: 900, storage: s3 ? 's3' : 'mock' });
});
app.get('/media/:id', async (req, res) => { const rows = await db.orm.select().from(mediaAssets).where(eq(mediaAssets.id, req.params.id)).limit(1); rows[0] ? res.json(rows[0]) : res.status(404).json({ code: 'NOT_FOUND' }); });
init().then(() => listen(app, 'media')).catch(error => { console.error(error); process.exitCode = 1; });
