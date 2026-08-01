const fs = require('fs');
const { google } = require('googleapis');

async function uploadVideo(oauth2Client, { filePath, mimeType, title, description, tags, privacyStatus }) {
  const youtube = google.youtube({ auth: oauth2Client, version: 'v3' });

  const { data } = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, ...(tags && tags.length ? { tags } : {}) },
      status: { privacyStatus: privacyStatus || 'private' },
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
  });

  return data;
}

async function updatePrivacy(oauth2Client, videoId, privacyStatus) {
  const youtube = google.youtube({ auth: oauth2Client, version: 'v3' });

  const { data } = await youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: { privacyStatus },
    },
  });

  return data;
}

async function getVideoStatus(oauth2Client, videoId) {
  const youtube = google.youtube({ auth: oauth2Client, version: 'v3' });

  const { data } = await youtube.videos.list({
    part: ['status', 'snippet'],
    id: [videoId],
  });

  return data.items && data.items[0];
}

async function listRecentUploads(oauth2Client, { maxResults = 25 } = {}) {
  const youtube = google.youtube({ auth: oauth2Client, version: 'v3' });

  const { data: channelData } = await youtube.channels.list({
    part: ['contentDetails'],
    mine: true,
  });
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const { data } = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadsPlaylistId,
    maxResults,
  });

  return data.items || [];
}

module.exports = { uploadVideo, updatePrivacy, getVideoStatus, listRecentUploads };
