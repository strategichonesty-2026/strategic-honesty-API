const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const youtubeAccountService = require('../services/youtubeAccountService');

const upload = multer({ dest: path.join(os.tmpdir(), 'strategic-honesty-uploads') });

const router = express.Router();

router.get('/connect', (req, res) => {
  res.redirect(youtubeAccountService.getConnectUrl());
});

router.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ error });
  }
  if (!code) {
    return res.status(400).json({ error: 'Missing "code" query parameter' });
  }

  try {
    const account = await youtubeAccountService.handleOAuthCallback(code);
    res.json({ connected: account });
  } catch (err) {
    res.status(502).json({ error: 'Failed to complete YouTube OAuth flow', details: err.message });
  }
});

router.get('/accounts', async (req, res) => {
  const accounts = await youtubeAccountService.listConnectedAccounts();
  res.json({ accounts });
});

router.post('/upload', upload.single('video'), async (req, res) => {
  const { googleUserId, title, description, privacyStatus } = req.body;
  const file = req.file;

  if (!googleUserId) {
    if (file) fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'Missing "googleUserId" field' });
  }
  if (!file) {
    return res.status(400).json({ error: 'Missing "video" file' });
  }
  if (!title) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'Missing "title" field' });
  }

  try {
    const video = await youtubeAccountService.uploadVideoForAccount(googleUserId, {
      filePath: file.path,
      mimeType: file.mimetype,
      title,
      description,
      privacyStatus,
    });
    res.status(201).json({ video });
  } catch (err) {
    const status = err.code === 'ACCOUNT_NOT_CONNECTED' ? 404 : 502;
    res.status(status).json({ error: 'Failed to upload video to YouTube', details: err.message });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

module.exports = router;
