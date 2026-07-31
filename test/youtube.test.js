const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/youtube/oauth2callback';
process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'test-internal-token';
process.env.SCHEDULER_CALLBACK_URL =
  process.env.SCHEDULER_CALLBACK_URL || 'http://localhost:3001/auth/youtube/service-callback';

const { createApp } = require('../src/app');
const authClient = require('../src/adapters/youtube/authClient');

const AUTH_HEADERS = { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN };

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

test('GET /youtube/connect wraps state + schedulerUserId into the Google state param', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/connect?state=abc123&schedulerUserId=user-9`, { redirect: 'manual' });
    const location = new URL(res.headers.get('location'));
    const wrapped = JSON.parse(Buffer.from(location.searchParams.get('state'), 'base64url').toString('utf8'));
    assert.deepEqual(wrapped, { state: 'abc123', schedulerUserId: 'user-9' });
  });
});

test('GET /youtube/oauth2callback without a code redirects to SCHEDULER_CALLBACK_URL with auth=error', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/oauth2callback`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.equal(location.origin + location.pathname, process.env.SCHEDULER_CALLBACK_URL);
    assert.equal(location.searchParams.get('auth'), 'error');
    assert.equal(location.searchParams.get('platform'), 'youtube');
  });
});

test('GET /youtube/oauth2callback with an error param redirects with that reason', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/oauth2callback?error=access_denied`, { redirect: 'manual' });
    const location = new URL(res.headers.get('location'));
    assert.equal(location.searchParams.get('auth'), 'error');
    assert.equal(location.searchParams.get('reason'), 'access_denied');
  });
});

test('GET /youtube/accounts without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/accounts`);
    assert.equal(res.status, 401);
  });
});

test('GET /youtube/accounts with a valid internal token returns 200', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/accounts`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.accounts));
  });
});

test('POST /youtube/upload without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('googleUserId', 'user-123');
    form.append('title', 'My video');
    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 401);
  });
});

test('POST /youtube/upload without googleUserId returns 400', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('title', 'My video');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', headers: AUTH_HEADERS, body: form });
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload without a video file returns 400', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('googleUserId', 'user-123');
    form.append('title', 'My video');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', headers: AUTH_HEADERS, body: form });
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload for an unconnected account returns 404', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('googleUserId', 'no-such-user');
    form.append('title', 'My video');
    form.append('video', new Blob(['fake video bytes'], { type: 'video/mp4' }), 'clip.mp4');

    const res = await fetch(`${base}/youtube/upload`, { method: 'POST', headers: AUTH_HEADERS, body: form });
    assert.equal(res.status, 404);
  });
});

test('POST /youtube/upload-from-url without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/upload-from-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleUserId: 'user-123', videoUrl: 'https://example.com/clip.mp4', title: 'x' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /youtube/upload-from-url without videoUrl returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/youtube/upload-from-url`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleUserId: 'user-123', title: 'My video' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /youtube/upload-from-url for an unconnected account returns 404 without downloading', async () => {
  await withServer(async (base) => {
    // videoUrl deliberately points nowhere reachable — if the service tried to
    // download before checking the account, this would fail with a network
    // error (502) instead of the expected 404.
    const res = await fetch(`${base}/youtube/upload-from-url`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        googleUserId: 'no-such-user',
        videoUrl: 'http://127.0.0.1:1/unreachable.mp4',
        title: 'My video',
      }),
    });
    assert.equal(res.status, 404);
  });
});
