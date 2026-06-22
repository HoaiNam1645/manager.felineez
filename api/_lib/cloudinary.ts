import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface UploadedImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

/**
 * Upload a base64 data URI or a remote URL to Cloudinary.
 * `folder` groups uploads (e.g. per-team) in the Cloudinary media library.
 */
export async function uploadImage(
  source: string,
  folder = 'nh-media/products'
): Promise<UploadedImage> {
  const res = await cloudinary.uploader.upload(source, {
    folder,
    resource_type: 'image',
    overwrite: false,
    unique_filename: true,
  });
  return {
    url: res.secure_url,
    publicId: res.public_id,
    width: res.width,
    height: res.height,
    format: res.format,
    bytes: res.bytes,
  };
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

export { cloudinary };
