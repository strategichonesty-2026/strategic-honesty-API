const { createBufferClient } = require('../adapters/buffer/client');
const { GET_ORGANIZATIONS, GET_CHANNELS, CREATE_POST } = require('../adapters/buffer/queries');
const { resizeUrlIfNeeded } = require('../adapters/imageResize');
const { trimVideoUrlIfNeeded } = require('../adapters/videoTrim');

// TikTok specifically should stay short — per user preference, not a
// platform-enforced hard limit (TikTok itself allows much longer video).
const TIKTOK_MAX_SECONDS = 60;

async function getOrganizationId(client) {
  const data = await client.request(GET_ORGANIZATIONS);
  const orgId = data.account?.organizations?.[0]?.id;
  if (!orgId) throw new Error('No Buffer organization found for this API key');
  return orgId;
}

async function listChannels() {
  const client = createBufferClient();
  const organizationId = await getOrganizationId(client);
  const data = await client.request(GET_CHANNELS, { organizationId });
  return data.channels || [];
}

// mediaType must be 'image' or 'video' when mediaUrl is given — matches
// Buffer's `assets` entry shape (each entry is exactly one of
// image/video/document/link, referenced by URL, no separate upload step).
//
// postType ('post' | 'story' | 'reel' | ...) is required by Buffer for
// Facebook and Instagram specifically — a Reel is the SAME channel
// connection as a regular post, just this one flag set differently.
// Defaults to 'post' since that's the common case.
const SERVICES_REQUIRING_POST_TYPE = ['facebook', 'instagram'];

async function createPost({ channelId, text, mediaUrl, mediaType, scheduledAt, postType, saveToDraft, service, publicBaseUrl }) {
  const client = createBufferClient();

  let finalMediaUrl = mediaUrl;
  if (mediaUrl && publicBaseUrl) {
    if (mediaType === 'image') {
      ({ url: finalMediaUrl } = await resizeUrlIfNeeded(mediaUrl, publicBaseUrl));
    } else if (mediaType === 'video' && service === 'tiktok') {
      ({ url: finalMediaUrl } = await trimVideoUrlIfNeeded(mediaUrl, TIKTOK_MAX_SECONDS, publicBaseUrl));
    }
  }

  const input = {
    text,
    channelId,
    schedulingType: 'automatic',
    ...(scheduledAt
      ? { mode: 'customScheduled', dueAt: scheduledAt }
      : { mode: 'addToQueue' }),
    ...(mediaUrl ? { assets: [{ [mediaType]: { url: finalMediaUrl } }] } : {}),
    ...(SERVICES_REQUIRING_POST_TYPE.includes(service)
      ? { metadata: { [service]: { type: postType || 'post' } } }
      : {}),
    ...(saveToDraft ? { saveToDraft: true } : {}),
  };

  const data = await client.request(CREATE_POST, { input });
  const result = data.createPost;

  if (result?.message && !result.post) {
    const error = new Error(result.message);
    error.code = 'BUFFER_MUTATION_ERROR';
    throw error;
  }

  return result.post;
}

module.exports = { listChannels, createPost };
