const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'test-internal-token';
delete process.env.BUFFER_API_KEY;

const { createApp } = require('../src/app');

const AUTH_HEADERS = { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN, 'Content-Type': 'application/json' };

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

test('GET /buffer/channels without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/channels`);
    assert.equal(res.status, 401);
  });
});

test('POST /buffer/post without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'c1', text: 'hello' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /buffer/post without channelId returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ text: 'hello' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /buffer/post without text returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ channelId: 'c1' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /buffer/post with mediaUrl but no mediaType returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ channelId: 'c1', text: 'hello', mediaUrl: 'https://example.com/a.mp4' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /buffer/post with an invalid mediaType returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ channelId: 'c1', text: 'hello', mediaUrl: 'https://example.com/a.mp4', mediaType: 'audio' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /buffer/post with an invalid scheduledAt returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ channelId: 'c1', text: 'hello', scheduledAt: 'not-a-date' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /buffer/post with valid input but no BUFFER_API_KEY configured returns 502', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ channelId: 'c1', text: 'hello' }),
    });
    assert.equal(res.status, 502);
  });
});

test('GET /buffer/posts without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/posts`);
    assert.equal(res.status, 401);
  });
});

test('GET /buffer/posts with an invalid startDate returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/posts?startDate=not-a-date`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 400);
  });
});

test('GET /buffer/posts with an invalid endDate returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/posts?endDate=not-a-date`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 400);
  });
});

test('GET /buffer/post/:id without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post/abc123`);
    assert.equal(res.status, 401);
  });
});

test('GET /buffer/post/:id with no BUFFER_API_KEY configured returns 502', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/buffer/post/abc123`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 502);
  });
});
