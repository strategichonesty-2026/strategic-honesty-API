const express = require('express');
const path = require('path');
const { mediaTempDir } = require('../adapters/mediaTempStore');

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

module.exports = router;
