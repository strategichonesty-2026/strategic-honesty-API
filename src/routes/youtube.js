const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const youtubeAccountService = require('../services/youtubeAccountService');
const { internalAuth } = require('../middleware/internalAuth');

const upload = multer({ dest: path.join(os.tmpdir(), 'strategic-honesty-uploads') });

const oauthRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const router = express.Router();

// Wraps the caller's own state + schedulerUserId into the `state` param we
// send to Google, so it survives the OAuth round trip without needing any
// server-side storage on this side (Google just echoes back whatever we
// send). Callers other than the scheduler can't forge anything useful this
// way — the redirect always lands on the scheduler's own fixed callback URL,
// which independently validates its own `state` against its own DB.
function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeState(wrapped) {
  try {
    return JSON.parse(Buffer.from(wrapped, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

router.get('/connect', oauthRateLimit, (req, res) => {
  const { state, schedulerUserId } = req.query;
  const wrapped = encodeState({ state, schedulerUserId });
  res.redirect(youtubeAccountService.getConnectUrl(wrapped));
});

router.get('/oauth2callback', oauthRateLimit, async (req, res) => {
  const { code, error, state: wrappedState } = req.query;
  const { state, schedulerUserId } = decodeState(wrappedState);
  const callbackUrl = process.env.SCHEDULER_CALLBACK_URL;

  const redirectWithError = (reason) => {
    if (!callbackUrl) return res.status(502).json({ error: reason });
    const url = new URL(callbackUrl);
    url.searchParams.set('auth', 'error');
    url.searchParams.set('platform', 'youtube');
    if (state) url.searchParams.set('state', state);
    url.searchParams.set('reason', reason);
    res.redirect(url.toString());
  };

  if (error) return redirectWithError(String(error));
  if (!code) return redirectWithError('missing_code');

  try {
    const account = await youtubeAccountService.handleOAuthCallback(code);
    if (!callbackUrl) return res.json({ connected: account });

    const url = new URL(callbackUrl);
    url.searchParams.set('auth', 'success');
    url.searchParams.set('platform', 'youtube');
    if (state) url.searchParams.set('state', state);
    if (schedulerUserId) url.searchParams.set('schedulerUserId', schedulerUserId);
    url.searchParams.set('googleUserId', account.googleUserId);
    if (account.channelTitle) url.searchParams.set('channelTitle', account.channelTitle);
    res.redirect(url.toString());
  } catch (err) {
    console.error('[youtube] oauth2callback failed:', err);
    redirectWithError(err.message || 'oauth_failed');
  }
});

router.get('/accounts', internalAuth, async (req, res) => {
  const accounts = await youtubeAccountService.listConnectedAccounts();
  res.json({ accounts });
});

router.post('/upload', internalAuth, upload.single('video'), async (req, res) => {
  const { googleUserId, title, description, privacyStatus } = req.body;
  const tags = req.body.tags ? req.body.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
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
      tags,
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

router.post('/upload-from-url', internalAuth, async (req, res) => {
  const { googleUserId, videoUrl, title, description, tags, privacyStatus } = req.body;

  if (!googleUserId) return res.status(400).json({ error: 'Missing "googleUserId" field' });
  if (!videoUrl) return res.status(400).json({ error: 'Missing "videoUrl" field' });
  if (!title) return res.status(400).json({ error: 'Missing "title" field' });

  try {
    const video = await youtubeAccountService.uploadVideoFromUrlForAccount(googleUserId, {
      videoUrl,
      title,
      description,
      tags,
      privacyStatus,
    });
    res.status(201).json({ video });
  } catch (err) {
    console.error('[youtube] upload-from-url failed:', err);
    const status = err.code === 'ACCOUNT_NOT_CONNECTED' ? 404 : 502;
    res.status(status).json({ error: 'Failed to upload video to YouTube', details: err.message });
  }
});

module.exports = router;
