// DigitalOcean Spaces (S3-compatible) storage for product files.
// Replaces Cloudinary for NEW uploads; legacy Cloudinary URLs keep working
// (and are still deleted via the old helper — see api/products/[id].ts).

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const BUCKET = process.env.DO_SPACES_BUCKET || '';
const REGION = process.env.DO_SPACES_REGION || 'nyc3';
const ENDPOINT = process.env.DO_SPACES_ENDPOINT || `https://${REGION}.digitaloceanspaces.com`;

const client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY || '',
    secretAccessKey: process.env.DO_SPACES_SECRET || '',
  },
});

export interface UploadedImage {
  url: string;
  publicId: string; // the Spaces object key
  format?: string;
  bytes?: number;
  name?: string;    // original filename, shown in the UI and used for downloads
}

const EXT_BY_MIME: { [mime: string]: string } = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
};

// Embroidery/design formats browsers report as octet-stream (or as nothing at
// all), so the extension has to come from the filename for these.
const MIME_BY_EXT: { [ext: string]: string } = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const MAX_BYTES = 100 * 1024 * 1024;

const extOf = (name?: string): string => {
  const m = /\.([a-z0-9]{1,8})$/i.exec((name || '').trim());
  return m ? m[1].toLowerCase() : '';
};

/** Resolve a base64 data URI or remote URL into a buffer + content type. */
async function toBuffer(source: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Any mime, including the empty one browsers emit for .emb/.dst/.pes files.
  const dataUri = source.match(/^data:([a-z0-9.+\/-]*);base64,(.+)$/i);
  if (dataUri) {
    return {
      buffer: Buffer.from(dataUri[2], 'base64'),
      contentType: (dataUri[1] || 'application/octet-stream').toLowerCase(),
    };
  }
  if (/^https?:\/\//i.test(source)) {
    const resp = await fetch(source);
    if (!resp.ok) throw new Error(`Failed to fetch remote file (${resp.status})`);
    const contentType = (resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].toLowerCase();
    return { buffer: Buffer.from(await resp.arrayBuffer()), contentType };
  }
  throw new Error('Unsupported file source (expect base64 data URI or http(s) URL)');
}

/**
 * Upload a base64 data URI or remote URL to Spaces (public-read).
 * `folder` mirrors the old Cloudinary layout, e.g. nh-media/products/<team>/<slug>.
 */
export async function uploadImage(
  source: string,
  folder = 'nh-media/products',
  originalName?: string
): Promise<UploadedImage> {
  if (!BUCKET || !process.env.DO_SPACES_KEY) {
    throw new Error('DigitalOcean Spaces is not configured (DO_SPACES_* env vars)');
  }
  const { buffer, contentType } = await toBuffer(source);
  if (buffer.length > MAX_BYTES) throw new Error(`File is too large (max ${MAX_BYTES / 1024 / 1024}MB)`);

  // Filename wins over mime: design formats arrive as octet-stream.
  const ext = extOf(originalName) || EXT_BY_MIME[contentType] || 'bin';
  const isImage = contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'].includes(ext);
  const storedType = contentType === 'application/octet-stream' && MIME_BY_EXT[ext] ? MIME_BY_EXT[ext] : contentType;

  const base = (originalName || '')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stem = `${Date.now()}-${randomUUID().slice(0, 8)}${base ? `-${base}` : ''}`;
  const key = `${folder.replace(/^\/+|\/+$/g, '')}/${stem}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: storedType,
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
    // Design files should download under their real name; images stay inline
    // so they can be previewed and used as mockup URLs by the factories.
    ...(isImage || !originalName
      ? {}
      : { ContentDisposition: `attachment; filename="${originalName.replace(/["\\]/g, '')}"` }),
  }));

  return {
    url: `https://${BUCKET}.${REGION}.digitaloceanspaces.com/${key}`,
    publicId: key,
    format: ext,
    bytes: buffer.length,
    name: originalName || undefined,
  };
}

/** Delete an object by its key (the stored publicId for Spaces images). */
export async function deleteImage(key: string): Promise<void> {
  if (!BUCKET) return;
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** True if an image record was stored on Spaces (vs legacy Cloudinary). */
export function isSpacesImage(im: { url?: string | null }): boolean {
  return !!im?.url && im.url.includes('digitaloceanspaces.com');
}
