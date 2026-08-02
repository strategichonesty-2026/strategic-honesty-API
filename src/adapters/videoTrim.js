const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { downloadTemp } = require('./youtube/downloadTemp');
const r2Upload = require('./r2Upload'); // called via the module object (not destructured) so tests can stub uploadBufferToR2
const path = require('path');
const { randomUUID } = require('crypto');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// TikTok specifically should stay short — per user preference, not a
// platform-enforced hard limit (TikTok itself allows much longer video).
const TIKTOK_MAX_SECONDS = 60;

// Not a resize trigger like the image caps in imageResize.js — a generous
// net that only catches accidentally-queued raw/uncompressed source files.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

function getDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration);
    });
  });
}

// Trims a video down to maxSeconds (from the start) and writes it to
// outputPath. Re-encodes with libx264/aac since a plain stream copy can
// produce a broken trailing keyframe/audio track at an arbitrary cut point.
function trimVideo(inputPath, outputPath, maxSeconds) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(0)
      .duration(maxSeconds)
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

// Trims in place (writes to a new temp path) only when the video exceeds
// maxSeconds; returns the original path untouched otherwise.
async function trimIfNeeded(filePath, maxSeconds, tempOutputPath) {
  const duration = await getDurationSeconds(filePath);
  if (duration <= maxSeconds) {
    return { path: filePath, trimmed: false, originalDuration: duration };
  }
  await trimVideo(filePath, tempOutputPath, maxSeconds);
  return { path: tempOutputPath, trimmed: true, originalDuration: duration };
}

// Downloads a remote video, trims it to maxSeconds if it's longer, and
// returns a URL Buffer/Postiz can fetch — either the original (untouched)
// or a freshly-trimmed copy uploaded to permanent R2 storage. A local temp
// file can't survive this service's own deploys long enough for a post
// scheduled hours/days/weeks out (confirmed: this was producing dead links
// in Buffer for exactly that reason). Cleans up both the downloaded
// original and the local trimmed output once uploaded.
async function trimVideoUrlIfNeeded(videoUrl, maxSeconds, publicBaseUrl) { // eslint-disable-line no-unused-vars -- publicBaseUrl kept for call-site compatibility
  const { path: downloadedPath } = await downloadTemp(videoUrl);
  let outputPath = null;
  try {
    const duration = await getDurationSeconds(downloadedPath);
    if (duration <= maxSeconds) {
      return { url: videoUrl, trimmed: false, originalDuration: duration };
    }

    outputPath = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
    await trimVideo(downloadedPath, outputPath, maxSeconds);
    const url = await r2Upload.uploadBufferToR2(fs.readFileSync(outputPath), 'mp4', 'video/mp4');
    return { url, trimmed: true, originalDuration: duration };
  } finally {
    fs.unlink(downloadedPath, () => {});
    if (outputPath) fs.unlink(outputPath, () => {});
  }
}

function getDimensions(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const videoStream = (data.streams || []).find((s) => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));
      resolve({ width: videoStream.width, height: videoStream.height });
    });
  });
}

// Scales up (never crops/pads) preserving aspect ratio until both dimensions
// clear the target minimum — one dimension may end up larger than its own
// minimum, which is fine since platforms only reject below-minimum, never
// above. Dimensions are rounded up to even numbers, a libx264 requirement.
function upscaleVideo(inputPath, outputPath, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`scale=${targetWidth}:${targetHeight}`)
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

async function upscaleToMinimumIfNeeded(filePath, minWidth, minHeight, outputPath) {
  const { width, height } = await getDimensions(filePath);
  if (width >= minWidth && height >= minHeight) {
    return { path: filePath, resized: false, originalWidth: width, originalHeight: height };
  }

  const scaleFactor = Math.max(minWidth / width, minHeight / height);
  const targetWidth = Math.ceil((width * scaleFactor) / 2) * 2;
  const targetHeight = Math.ceil((height * scaleFactor) / 2) * 2;
  await upscaleVideo(filePath, outputPath, targetWidth, targetHeight);
  return { path: outputPath, resized: true, originalWidth: width, originalHeight: height, newWidth: targetWidth, newHeight: targetHeight };
}

// Downloads a remote video, upscales it if either dimension is below the
// platform's minimum (e.g. Facebook/Instagram Reels reject anything under
// 540x960 — confirmed via a real rejected post), and returns a URL
// Buffer/Postiz can fetch. Mirrors trimVideoUrlIfNeeded's shape/cleanup —
// uploads to permanent R2 storage rather than a local temp file.
async function resizeVideoUrlIfNeeded(videoUrl, minWidth, minHeight, publicBaseUrl) { // eslint-disable-line no-unused-vars -- publicBaseUrl kept for call-site compatibility
  const { path: downloadedPath } = await downloadTemp(videoUrl);
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
  try {
    const result = await upscaleToMinimumIfNeeded(downloadedPath, minWidth, minHeight, outputPath);
    if (!result.resized) return { url: videoUrl, resized: false };
    const url = await r2Upload.uploadBufferToR2(fs.readFileSync(outputPath), 'mp4', 'video/mp4');
    return { url, resized: true };
  } finally {
    fs.unlink(downloadedPath, () => {});
    fs.unlink(outputPath, () => {});
  }
}

module.exports = {
  getDurationSeconds,
  trimVideo,
  trimIfNeeded,
  trimVideoUrlIfNeeded,
  getDimensions,
  upscaleToMinimumIfNeeded,
  resizeVideoUrlIfNeeded,
  TIKTOK_MAX_SECONDS,
  MAX_VIDEO_BYTES,
};
