const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const mediaTempDir = path.join(os.tmpdir(), 'strategic-honesty-media-temp');
fs.mkdirSync(mediaTempDir, { recursive: true });

const CLEANUP_MS = 30 * 60 * 1000; // 30 min — plenty of time for Buffer/Postiz to fetch it

// Writes a processed (resized/trimmed) media buffer to a short-lived,
// publicly-servable temp path and schedules its own cleanup — used when we
// need to hand Buffer/Postiz a public URL for media we just modified
// in-process, rather than the original source URL.
function storeTempMedia(buffer, extension) {
  const filename = `${randomUUID()}.${extension}`;
  const filePath = path.join(mediaTempDir, filename);
  fs.writeFileSync(filePath, buffer);
  setTimeout(() => fs.unlink(filePath, () => {}), CLEANUP_MS).unref();
  return filename;
}

function tempMediaUrl(publicBaseUrl, filename) {
  return `${publicBaseUrl}/media/${filename}`;
}

module.exports = { mediaTempDir, storeTempMedia, tempMediaUrl };
