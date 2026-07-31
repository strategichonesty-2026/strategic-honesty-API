const { createBufferClient } = require('../adapters/buffer/client');
const { GET_ORGANIZATIONS, GET_CHANNELS, CREATE_POST } = require('../adapters/buffer/queries');

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
async function createPost({ channelId, text, mediaUrl, mediaType, scheduledAt }) {
  const client = createBufferClient();

  const input = {
    text,
    channelId,
    schedulingType: 'automatic',
    ...(scheduledAt
      ? { mode: 'customScheduled', dueAt: scheduledAt }
      : { mode: 'addToQueue' }),
    ...(mediaUrl ? { assets: [{ [mediaType]: { url: mediaUrl } }] } : {}),
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
