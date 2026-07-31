const express = require('express');
const bufferPostService = require('../services/bufferPostService');
const { internalAuth } = require('../middleware/internalAuth');

const router = express.Router();

router.get('/channels', internalAuth, async (req, res) => {
  try {
    const channels = await bufferPostService.listChannels();
    res.json({ channels });
  } catch (err) {
    res.status(502).json({ error: 'Failed to list Buffer channels', details: err.message });
  }
});

router.post('/post', internalAuth, async (req, res) => {
  const { channelId, text, mediaUrl, mediaType, scheduledAt, service, postType, saveToDraft } = req.body;

  if (!channelId) return res.status(400).json({ error: 'Missing "channelId" field' });
  if (!text) return res.status(400).json({ error: 'Missing "text" field' });
  if (mediaUrl && !['image', 'video'].includes(mediaType)) {
    return res.status(400).json({ error: '"mediaType" must be "image" or "video" when "mediaUrl" is given' });
  }
  if (scheduledAt && isNaN(new Date(scheduledAt).getTime())) {
    return res.status(400).json({ error: 'Invalid "scheduledAt" datetime' });
  }

  try {
    const post = await bufferPostService.createPost({
      channelId,
      text,
      mediaUrl,
      mediaType,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      service,
      postType,
      saveToDraft,
    });
    res.status(201).json({ post });
  } catch (err) {
    res.status(502).json({ error: 'Failed to create Buffer post', details: err.message });
  }
});

module.exports = router;
