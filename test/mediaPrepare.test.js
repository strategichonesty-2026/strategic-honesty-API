const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');

process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'test-internal-token';

const { createApp } = require('../src/app');
const r2Upload = require('../src/adapters/r2Upload');

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

test('POST /media/prepare without an internal token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', kind: 'image' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /media/prepare without url returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/prepare`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ kind: 'image' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /media/prepare with an invalid kind returns 400', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/prepare`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ url: 'https://example.com/a.jpg', kind: 'audio' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /media/prepare leaves a small image untouched', async () => {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .jpeg()
    .toBuffer();

  await withFixtureServer(buffer, 'image/jpeg', async (fixtureUrl) => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/media/prepare`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ url: fixtureUrl, kind: 'image' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.changed, false);
      assert.equal(body.url, fixtureUrl);
    });
  });
});

test('POST /media/prepare resizes an oversized image and uploads the resized copy to R2', async () => {
  const buffer = await sharp({
    create: { width: 3000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .jpeg()
    .toBuffer();

  // Real R2 credentials/network access aren't available (or wanted) in
  // tests — stub the upload so the resize logic itself is verified without
  // hitting real storage. resizeUrlIfNeeded no longer serves media from this
  // service's own local /media/ route (a local temp file can't survive this
  // service's own deploys long enough for a post scheduled hours/days out —
  // this was silently producing dead links in Buffer).
  let uploadedBuffer = null;
  let uploadedContentType = null;
  const originalUpload = r2Upload.uploadBufferToR2;
  r2Upload.uploadBufferToR2 = async (buf, extension, contentType) => {
    uploadedBuffer = buf;
    uploadedContentType = contentType;
    return 'https://pub-fake-bucket.r2.dev/prepared/fake-resized.jpg';
  };

  try {
    await withFixtureServer(buffer, 'image/jpeg', async (fixtureUrl) => {
      await withServer(async (base) => {
        const res = await fetch(`${base}/media/prepare`, {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ url: fixtureUrl, kind: 'image' }),
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.changed, true);
        assert.equal(body.url, 'https://pub-fake-bucket.r2.dev/prepared/fake-resized.jpg');
        assert.equal(uploadedContentType, 'image/jpeg');

        const meta = await sharp(uploadedBuffer).metadata();
        assert.ok(meta.width <= 2048);
        assert.ok(meta.height <= 2048);
      });
    });
  } finally {
    r2Upload.uploadBufferToR2 = originalUpload;
  }
});

test('POST /media/prepare leaves a non-tiktok video untouched', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/prepare`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ url: 'https://example.com/a.mp4', kind: 'video', service: 'instagram' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.changed, false);
    assert.equal(body.url, 'https://example.com/a.mp4');
  });
});
