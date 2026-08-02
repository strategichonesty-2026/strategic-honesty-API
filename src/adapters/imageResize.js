const axios = require('axios');
const sharp = require('sharp');
const r2Upload = require('./r2Upload'); // called via the module object (not destructured) so tests can stub uploadBufferToR2

// Meta (Facebook/Instagram/Threads) rejects images with very large
// dimensions or file sizes ("Meta is having trouble with this post...large
// image dimensions"). These limits are comfortably under Meta's own caps.
const MAX_DIMENSION = 2048;
const MAX_BYTES = 4 * 1024 * 1024;

// Resizes down (never up) and re-encodes as JPEG when an image exceeds
// either limit; returns the original buffer untouched otherwise, so
// already-reasonable images aren't needlessly re-encoded.
async function resizeIfNeeded(buffer) {
  const meta = await sharp(buffer).metadata();
  const tooLarge = (meta.width || 0) > MAX_DIMENSION || (meta.height || 0) > MAX_DIMENSION;
  const tooHeavy = buffer.length > MAX_BYTES;

  if (!tooLarge && !tooHeavy) {
    return { buffer, mimeType: null, resized: false, width: meta.width, height: meta.height, bytes: buffer.length };
  }

  const resized = await sharp(buffer)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();

  return {
    buffer: resized,
    mimeType: 'image/jpeg',
    resized: true,
    width: resizedMeta.width,
    height: resizedMeta.height,
    bytes: resized.length,
  };
}

// Downloads a remote image, resizes it if needed, and returns a URL
// Buffer/Postiz can fetch — either the original (untouched) or a freshly
// resized copy uploaded to permanent R2 storage (not a local temp file,
// which can't survive this service's own deploys long enough for a post
// scheduled hours/days/weeks out).
async function resizeUrlIfNeeded(imageUrl, publicBaseUrl) { // eslint-disable-line no-unused-vars -- publicBaseUrl kept for call-site compatibility
  const { data } = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const { buffer, resized } = await resizeIfNeeded(Buffer.from(data));
  if (!resized) return { url: imageUrl, resized: false };

  const url = await r2Upload.uploadBufferToR2(buffer, 'jpg', 'image/jpeg');
  return { url, resized: true };
}

module.exports = { resizeIfNeeded, resizeUrlIfNeeded, MAX_DIMENSION, MAX_BYTES };
