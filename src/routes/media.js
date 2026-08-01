const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { mediaTempDir } = require('../adapters/mediaTempStore');
const { resizeIfNeeded, resizeUrlIfNeeded } = require('../adapters/imageResize');
const { downloadTemp } = require('../adapters/youtube/downloadTemp');
const {
  getDurationSeconds,
  trimVideoUrlIfNeeded,
  TIKTOK_MAX_SECONDS,
  MAX_VIDEO_BYTES,
} = require('../adapters/videoTrim');
const { internalAuth } = require('../middleware/internalAuth');

const router = express.Router();

// Filenames are always our own generated UUID + extension (see
// mediaTempStore.js) — reject anything else to prevent path traversal.
const SAFE_FILENAME = /^[a-f0-9-]{36}\.(jpg|mp4)$/;

router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  if (!SAFE_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  res.sendFile(path.join(mediaTempDir, filename), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found or already expired' });
    }
  });
});

// Reports findings rather than erroring on bad media — the caller (a batch
// scan loop) shouldn't need per-item try/catch to keep iterating, so
// unreachable/corrupt media is a 200 with a flag, not a 4xx/5xx.
router.post('/inspect', internalAuth, async (req, res) => {
  const { url, kind } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing "url" field' });
  if (!['image', 'video'].includes(kind)) {
    return res.status(400).json({ error: '"kind" must be "image" or "video"' });
  }

  if (kind === 'image') {
    let buffer;
    try {
      const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      buffer = Buffer.from(data);
    } catch (err) {
      return res.json({ reachable: false, kind: 'image', error: err.message });
    }
    try {
      const { resized, width, height, bytes } = await resizeIfNeeded(buffer);
      return res.json({ reachable: true, kind: 'image', corrupt: false, width, height, bytes, tooLarge: resized });
    } catch (err) {
      return res.json({ reachable: true, kind: 'image', corrupt: true, error: err.message });
    }
  }

  let downloaded;
  try {
    downloaded = await downloadTemp(url);
  } catch (err) {
    return res.json({ reachable: false, kind: 'video', error: err.message });
  }
  try {
    const bytes = fs.statSync(downloaded.path).size;
    let durationSeconds;
    try {
      durationSeconds = await getDurationSeconds(downloaded.path);
    } catch (err) {
      return res.json({ reachable: true, kind: 'video', corrupt: true, error: err.message });
    }
    return res.json({
      reachable: true,
      kind: 'video',
      corrupt: false,
      durationSeconds,
      bytes,
      tooLarge: bytes > MAX_VIDEO_BYTES,
    });
  } finally {
    fs.unlink(downloaded.path, () => {});
  }
});

// The "fix it" counterpart to /inspect — same resize/trim logic
// bufferPostService.js already runs for the Buffer path, exposed here so
// the Postiz path (a different repo/service) can apply the same protection.
router.post('/prepare', internalAuth, async (req, res) => {
  const { url, kind, service } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing "url" field' });
  if (!['image', 'video'].includes(kind)) {
    return res.status(400).json({ error: '"kind" must be "image" or "video"' });
  }

  const publicBaseUrl = `${req.protocol}://${req.get('host')}`;

  try {
    if (kind === 'image') {
      const { url: finalUrl, resized } = await resizeUrlIfNeeded(url, publicBaseUrl);
      return res.json({ url: finalUrl, changed: resized });
    }
    if (kind === 'video' && service === 'tiktok') {
      const { url: finalUrl, trimmed } = await trimVideoUrlIfNeeded(url, TIKTOK_MAX_SECONDS, publicBaseUrl);
      return res.json({ url: finalUrl, changed: trimmed });
    }
    return res.json({ url, changed: false });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to prepare media', details: err.message });
  }
});

module.exports = router;
