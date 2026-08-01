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

module.exports = { uploadVideo, updatePrivacy };
