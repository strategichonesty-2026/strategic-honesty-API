const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');

process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'test-internal-token';

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

// Serves a fixed buffer with a given content-type from a throwaway local
// server, so /media/inspect has something real (or realistically fake) to
// fetch without depending on any external URL.
async function withFixtureServer(buffer, contentType, fn) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(buffer);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}/fixture`);
  } finally {
    server.close();
  }
}

test('POST /media/inspect without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', kind: 'image' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /media/inspect without url returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/inspect`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ kind: 'image' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /media/inspect with an invalid kind returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/inspect`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ url: 'https://example.com/a.jpg', kind: 'audio' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /media/inspect reports reachable:false for an unreachable image URL', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/inspect`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ url: 'http://127.0.0.1:1/nope.jpg', kind: 'image' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reachable, false);
  });
});

test('POST /media/inspect reports corrupt:true for garbage bytes claiming to be an image', async () => {
  await withFixtureServer(Buffer.from('not actually a jpeg'), 'image/jpeg', async (fixtureUrl) => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/media/inspect`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ url: fixtureUrl, kind: 'image' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.reachable, true);
      assert.equal(body.corrupt, true);
    });
  });
});

test('POST /media/inspect reports dimensions for a small valid image, not flagged as too large', async () => {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();

  await withFixtureServer(buffer, 'image/jpeg', async (fixtureUrl) => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/media/inspect`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ url: fixtureUrl, kind: 'image' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.reachable, true);
      assert.equal(body.corrupt, false);
      assert.equal(body.tooLarge, false);
      assert.equal(body.width, 100);
      assert.equal(body.height, 100);
    });
  });
});

test('POST /media/inspect reports corrupt:true for garbage bytes claiming to be a video', async () => {
  await withFixtureServer(Buffer.from('not actually an mp4'), 'video/mp4', async (fixtureUrl) => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/media/inspect`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ url: fixtureUrl, kind: 'video' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.reachable, true);
      assert.equal(body.corrupt, true);
    });
  });
});

test('POST /media/inspect reports reachable:false for an unreachable video URL', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/inspect`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ url: 'http://127.0.0.1:1/nope.mp4', kind: 'video' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reachable, false);
  });
});
