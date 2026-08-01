const fs = require('fs');
const { prisma } = require('../db/prismaClient');
const authClient = require('../adapters/youtube/authClient');
const uploader = require('../adapters/youtube/uploader');
const { downloadTemp } = require('../adapters/youtube/downloadTemp');

const QUOTA_ERROR_MESSAGES = {
  quotaExceeded: 'YouTube API daily quota exceeded for this project — try again after the quota resets (~midnight Pacific time), or request a quota increase in Google Cloud Console.',
  uploadLimitExceeded: 'This YouTube channel has hit its upload limit — Google restricts how many videos/how much data a channel can upload per day.',
  dailyLimitExceeded: 'YouTube API daily limit exceeded for this project.',
};

// Maps a googleapis error to a clear, user-facing message when it recognizes
// the failure reason; otherwise returns the original error message untouched.
function classifyYoutubeError(err) {
  const reason = err.errors?.[0]?.reason || err.response?.data?.error?.errors?.[0]?.reason;
  if (reason && QUOTA_ERROR_MESSAGES[reason]) {
    const classified = new Error(QUOTA_ERROR_MESSAGES[reason]);
    classified.code = 'YOUTUBE_' + reason.toUpperCase();
    classified.cause = err;
    return classified;
  }
  return err;
}

function toPublicAccount(credential) {
  return {
    googleUserId: credential.googleUserId,
    email: credential.email,
    channelId: credential.channelId,
    channelTitle: credential.channelTitle,
    connectedAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function getConnectUrl(state) {
  const client = authClient.createOAuth2Client();
  return authClient.getAuthUrl(client, state);
}

async function handleOAuthCallback(code) {
  const client = authClient.createOAuth2Client();
  const tokens = await authClient.exchangeCodeForTokens(client, code);
  client.setCredentials(tokens);

  const { googleUserId, email } = await authClient.getGoogleAccountInfo(client);
  const channel = await authClient.getOwnChannel(client);

  if (!tokens.refresh_token) {
    const existing = await prisma.youtubeCredential.findUnique({ where: { googleUserId } });
    if (existing) {
      tokens.refresh_token = existing.refreshToken;
    }
  }

  const credential = await prisma.youtubeCredential.upsert({
    where: { googleUserId },
    create: {
      googleUserId,
      email,
      channelId: channel && channel.channelId,
      channelTitle: channel && channel.channelTitle,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope || authClient.YOUTUBE_UPLOAD_SCOPES.join(' '),
      tokenType: tokens.token_type,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      email,
      channelId: channel && channel.channelId,
      channelTitle: channel && channel.channelTitle,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope || authClient.YOUTUBE_UPLOAD_SCOPES.join(' '),
      tokenType: tokens.token_type,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  return toPublicAccount(credential);
}

async function listConnectedAccounts() {
  const credentials = await prisma.youtubeCredential.findMany({ orderBy: { createdAt: 'asc' } });
  return credentials.map(toPublicAccount);
}

async function getAuthorizedClient(googleUserId) {
  const credential = await prisma.youtubeCredential.findUnique({ where: { googleUserId } });
  if (!credential) return null;

  const client = authClient.createOAuth2Client();
  client.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    scope: credential.scope,
    token_type: credential.tokenType,
    expiry_date: credential.expiryDate ? credential.expiryDate.getTime() : undefined,
  });

  client.on('tokens', async (tokens) => {
    await prisma.youtubeCredential.update({
      where: { googleUserId },
      data: {
        accessToken: tokens.access_token || credential.accessToken,
        refreshToken: tokens.refresh_token || credential.refreshToken,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : credential.expiryDate,
      },
    });
  });

  return client;
}

function requireAuthorizedClient(googleUserId) {
  return getAuthorizedClient(googleUserId).then((client) => {
    if (!client) {
      const error = new Error(`No connected YouTube account for googleUserId "${googleUserId}"`);
      error.code = 'ACCOUNT_NOT_CONNECTED';
      throw error;
    }
    return client;
  });
}

async function uploadVideoForAccount(googleUserId, videoInput) {
  const client = await requireAuthorizedClient(googleUserId);

  try {
    return await uploader.uploadVideo(client, videoInput);
  } catch (err) {
    throw classifyYoutubeError(err);
  }
}

// Downloads a video from a URL to a temp file, uploads it, and always cleans
// up the temp file afterward — used by the service-to-service upload-from-url
// route, where the caller only has a media URL (e.g. from Media Studio),
// not a local file. Checks the account is connected BEFORE downloading, so a
// disconnected/unknown account fails fast instead of wasting a full download.
async function uploadVideoFromUrlForAccount(googleUserId, { videoUrl, title, description, tags, privacyStatus }) {
  const client = await requireAuthorizedClient(googleUserId);
  const { path: filePath, mimeType } = await downloadTemp(videoUrl);
  try {
    return await uploader.uploadVideo(client, { filePath, mimeType, title, description, tags, privacyStatus });
  } catch (err) {
    throw classifyYoutubeError(err);
  } finally {
    fs.unlink(filePath, () => {});
  }
}

async function setVideoPrivacyForAccount(googleUserId, videoId, privacyStatus) {
  const client = await requireAuthorizedClient(googleUserId);

  try {
    return await uploader.updatePrivacy(client, videoId, privacyStatus);
  } catch (err) {
    throw classifyYoutubeError(err);
  }
}

async function getVideoStatusForAccount(googleUserId, videoId) {
  const client = await requireAuthorizedClient(googleUserId);

  try {
    return await uploader.getVideoStatus(client, videoId);
  } catch (err) {
    throw classifyYoutubeError(err);
  }
}

async function listRecentVideosForAccount(googleUserId, maxResults) {
  const client = await requireAuthorizedClient(googleUserId);

  try {
    return await uploader.listRecentUploads(client, { maxResults });
  } catch (err) {
    throw classifyYoutubeError(err);
  }
}

module.exports = {
  getConnectUrl,
  handleOAuthCallback,
  listConnectedAccounts,
  getAuthorizedClient,
  uploadVideoForAccount,
  uploadVideoFromUrlForAccount,
  setVideoPrivacyForAccount,
  getVideoStatusForAccount,
  listRecentVideosForAccount,
};
