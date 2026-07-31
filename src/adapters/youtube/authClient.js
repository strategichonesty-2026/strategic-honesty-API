const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');

const YOUTUBE_UPLOAD_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/userinfo.email',
];

function createOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: YOUTUBE_UPLOAD_SCOPES,
  });
}

async function exchangeCodeForTokens(oauth2Client, code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function getGoogleAccountInfo(oauth2Client) {
  const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
  const { data } = await oauth2.userinfo.get();
  return { googleUserId: data.id, email: data.email };
}

async function getOwnChannel(oauth2Client) {
  const youtube = google.youtube({ auth: oauth2Client, version: 'v3' });
  const { data } = await youtube.channels.list({ part: ['id', 'snippet'], mine: true });
  const channel = data.items && data.items[0];
  if (!channel) return null;
  return { channelId: channel.id, channelTitle: channel.snippet && channel.snippet.title };
}

module.exports = {
  YOUTUBE_UPLOAD_SCOPES,
  createOAuth2Client,
  getAuthUrl,
  exchangeCodeForTokens,
  getGoogleAccountInfo,
  getOwnChannel,
};
