const path = require('path');
const cloudinary = require('cloudinary').v2;

/**
 * Returns a configured Cloudinary instance dynamically reloading .env if needed
 */
function getCloudinary() {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });
    require('dotenv').config();
  } catch {}

  const cloud_name = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const api_key = (process.env.CLOUDINARY_API_KEY || '').trim();
  const api_secret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const cloudinary_url = (process.env.CLOUDINARY_URL || '').trim();

  if (cloudinary_url) {
    cloudinary.config({
      cloudinary_url,
      secure: true,
    });
    return cloudinary;
  }

  if (cloud_name && api_key && api_secret) {
    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    });
    return cloudinary;
  }

  return null;
}

module.exports = {
  cloudinary,
  getCloudinary,
  isConfigured: () => Boolean(getCloudinary()),
};
