const { v2: cloudinary } = require('cloudinary');
const { randomUUID } = require('crypto');
const path = require('path');

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

function uploadBuffer(buffer, options = {}) {
  configureCloudinary();
  const resourceType = options.resourceType || 'image';
  const extension = String(options.extension || '').replace(/^\./, '').toLowerCase();
  const baseId = options.publicId || randomUUID();
  const publicId = resourceType === 'raw' && extension ? baseId + '.' + extension : baseId;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      folder: options.folder || 'al-ameen',
      public_id: publicId,
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      ...(resourceType === 'image' ? { format: options.format || 'webp' } : {}),
    }, (error, result) => error ? reject(error) : resolve({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
    }));
    stream.end(buffer);
  });
}

function cloudinaryAsset(url) {
  const match = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/i);
  if (!match) return null;
  let publicId = decodeURIComponent(match[2]).split(/[?#]/)[0];
  if (match[1] !== 'raw') publicId = publicId.replace(/\.[^.\/]+$/, '');
  return { resourceType: match[1].toLowerCase(), publicId };
}

async function deleteCloudinaryUrl(url) {
  const asset = cloudinaryAsset(url);
  if (!asset) return false;
  configureCloudinary();
  await cloudinary.uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType,
    invalidate: true,
  });
  return true;
}

function extensionFromUrl(url, fallback = '') {
  try {
    return path.extname(new URL(url).pathname) || fallback;
  } catch {
    return path.extname(String(url || '')) || fallback;
  }
}

module.exports = {
  uploadBuffer,
  deleteCloudinaryUrl,
  cloudinaryAsset,
  extensionFromUrl,
};
