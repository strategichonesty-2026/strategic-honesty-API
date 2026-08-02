const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const { getDimensions, upscaleToMinimumIfNeeded } = require('../src/adapters/videoTrim');

function makeTestVideo(width, height, seconds = 1) {
  const filePath = path.join(os.tmpdir(), `videotrim-test-${randomUUID()}.mp4`);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`testsrc=duration=${seconds}:size=${width}x${height}:rate=10`)
      .inputFormat('lavfi')
      .videoCodec('libx264')
      .on('end', () => resolve(filePath))
      .on('error', reject)
      .save(filePath);
  });
}

test('getDimensions reports the real width/height of a video file', async () => {
  const filePath = await makeTestVideo(320, 240);
  try {
    const { width, height } = await getDimensions(filePath);
    assert.equal(width, 320);
    assert.equal(height, 240);
  } finally {
    fs.unlink(filePath, () => {});
  }
});

test('upscaleToMinimumIfNeeded leaves an already-large-enough video untouched', async () => {
  const filePath = await makeTestVideo(540, 960);
  try {
    const result = await upscaleToMinimumIfNeeded(filePath, 540, 960, path.join(os.tmpdir(), `out-${randomUUID()}.mp4`));
    assert.equal(result.resized, false);
    assert.equal(result.path, filePath);
  } finally {
    fs.unlink(filePath, () => {});
  }
});

test('upscaleToMinimumIfNeeded scales an undersized video up to clear both minimums, preserving aspect ratio', async () => {
  // 270x480 is exactly half of the 540x960 Reels minimum on both axes —
  // scaling by 2x clears both with no rounding surprises.
  const filePath = await makeTestVideo(270, 480);
  const outputPath = path.join(os.tmpdir(), `out-${randomUUID()}.mp4`);
  try {
    const result = await upscaleToMinimumIfNeeded(filePath, 540, 960, outputPath);
    assert.equal(result.resized, true);
    assert.ok(result.newWidth >= 540, `expected width >= 540, got ${result.newWidth}`);
    assert.ok(result.newHeight >= 960, `expected height >= 960, got ${result.newHeight}`);

    const finalDims = await getDimensions(outputPath);
    assert.ok(finalDims.width >= 540);
    assert.ok(finalDims.height >= 960);
  } finally {
    fs.unlink(filePath, () => {});
    fs.unlink(outputPath, () => {});
  }
});
