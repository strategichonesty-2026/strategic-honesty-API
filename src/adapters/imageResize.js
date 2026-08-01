const axios = require('axios');
const sharp = require('sharp');
const { storeTempMedia, tempMediaUrl } = require('./mediaTempStore');

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
    return { buffer, mimeType: null, resized: false };
  }

  const resized = await sharp(buffer)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { buffer: resized, mimeType: 'image/jpeg', resized: true };
}

// Downloads a remote image, resizes it if needed, and returns a URL
// Buffer/Postiz can fetch — either the original (untouched) or a freshly
// resized copy served from our own temp media store.
async function resizeUrlIfNeeded(imageUrl, publicBaseUrl) {
  const { data } = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const { buffer, resized } = await resizeIfNeeded(Buffer.from(data));
  if (!resized) return { url: imageUrl, resized: false };

  const filename = storeTempMedia(buffer, 'jpg');
  return { url: tempMediaUrl(publicBaseUrl, filename), resized: true };
}

module.exports = { resizeIfNeeded, resizeUrlIfNeeded, MAX_DIMENSION, MAX_BYTES };
