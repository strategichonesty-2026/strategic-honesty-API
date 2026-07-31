const { prisma } = require('../db/prismaClient');
const authClient = require('../adapters/youtube/authClient');
const uploader = require('../adapters/youtube/uploader');

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

function getConnectUrl() {
  const client = authClient.createOAuth2Client();
  return authClient.getAuthUrl(client);
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

async function uploadVideoForAccount(googleUserId, videoInput) {
  const client = await getAuthorizedClient(googleUserId);
  if (!client) {
    const error = new Error(`No connected YouTube account for googleUserId "${googleUserId}"`);
    error.code = 'ACCOUNT_NOT_CONNECTED';
    throw error;
  }

  return uploader.uploadVideo(client, videoInput);
}

module.exports = {
  getConnectUrl,
  handleOAuthCallback,
  listConnectedAccounts,
  getAuthorizedClient,
  uploadVideoForAccount,
};
