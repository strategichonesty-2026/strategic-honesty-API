const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { createApp } = require('../src/app');

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

test('GET /media/:filename rejects a path-traversal attempt', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/${encodeURIComponent('../../etc/passwd')}`);
    assert.equal(res.status, 400);
  });
});

test('GET /media/:filename rejects a non-UUID filename', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/not-a-real-file.mp4`);
    assert.equal(res.status, 400);
  });
});

test('GET /media/:filename returns 404 for a well-formed but non-existent file', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/media/${randomUUID()}.jpg`);
    assert.equal(res.status, 404);
  });
});
