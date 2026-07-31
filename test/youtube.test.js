const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/youtube/oauth2callback';

const { createApp } = require('../src/app');
const authClient = require('../src/adapters/youtube/authClient');

async function withServer(fn) {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('authClient.getAuthUrl builds a Google consent URL with the upload scope', () => {
  const client = authClient.createOAuth2Client();
  const url = new URL(authClient.getAuthUrl(client));

  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'test-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.match(url.searchParams.get('scope'), /youtube\.upload/);
});

test('GET /youtube/connect redirects to the Google consent screen', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/connect`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /^https:\/\/accounts\.google\.com/);
  });
});

test('GET /youtube/oauth2callback without a code returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/oauth2callback`);
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload without googleUserId returns 400', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('title', 'My video');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload without a video file returns 400', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('googleUserId', 'user-123');
    form.append('title', 'My video');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload for an unconnected account returns 404', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('googleUserId', 'no-such-user');
    form.append('title', 'My video');
    form.append('video', new Blob(['fake video bytes'], { type: 'video/mp4' }), 'clip.mp4');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 404);
  });
});
