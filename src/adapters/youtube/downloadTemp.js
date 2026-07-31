const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — comfortably above a typical short/long-form video
const STALL_TIMEOUT_MS = 30 * 1000; // abort if no new bytes arrive for 30s
const TOTAL_TIMEOUT_MS = 30 * 60 * 1000; // hard ceiling on the whole download

// Streams a remote video to a temp file. Guards against a stalled connection
// (no bytes for STALL_TIMEOUT_MS) and against runaway/oversized responses —
// axios's own `timeout` only bounds time-to-first-byte, not total transfer
// duration, so both are enforced manually here.
async function downloadTemp(videoUrl) {
  const tempPath = path.join(os.tmpdir(), `strategic-honesty-dl-${crypto.randomBytes(8).toString('hex')}`);
  const response = await axios.get(videoUrl, {
    responseType: 'stream',
    timeout: 15000,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
  });

  const mimeType = response.headers['content-type'] || 'video/mp4';
  const writeStream = fs.createWriteStream(tempPath);

  let receivedBytes = 0;
  let stallTimer;
  let totalTimer;

  await new Promise((resolve, reject) => {
    const cleanupTimers = () => {
      clearTimeout(stallTimer);
      clearTimeout(totalTimer);
    };

    const fail = (err) => {
      cleanupTimers();
      response.data.destroy();
      writeStream.destroy();
      fs.unlink(tempPath, () => {});
      reject(err);
    };

    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => fail(new Error(`Download stalled — no data received for ${STALL_TIMEOUT_MS / 1000}s`)), STALL_TIMEOUT_MS);
    };

    totalTimer = setTimeout(() => fail(new Error(`Download exceeded maximum duration of ${TOTAL_TIMEOUT_MS / 1000}s`)), TOTAL_TIMEOUT_MS);
    resetStallTimer();

    response.data.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BYTES) {
        fail(new Error(`Download exceeded maximum size of ${MAX_BYTES} bytes`));
        return;
      }
      resetStallTimer();
    });

    response.data.on('error', fail);
    writeStream.on('error', fail);
    writeStream.on('finish', () => {
      cleanupTimers();
      resolve();
    });

    response.data.pipe(writeStream);
  });

  return { path: tempPath, mimeType };
}

module.exports = { downloadTemp };
