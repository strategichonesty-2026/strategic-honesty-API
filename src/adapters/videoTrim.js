const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { downloadTemp } = require('./youtube/downloadTemp');
const { mediaTempDir } = require('./mediaTempStore');
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
// or a freshly-trimmed copy served from our own temp media store. Always
// cleans up the downloaded original; the trimmed copy (if any) cleans
// itself up later via mediaTempStore's own scheduled deletion.
async function trimVideoUrlIfNeeded(videoUrl, maxSeconds, publicBaseUrl) {
  const { path: downloadedPath } = await downloadTemp(videoUrl);
  try {
    const duration = await getDurationSeconds(downloadedPath);
    if (duration <= maxSeconds) {
      return { url: videoUrl, trimmed: false, originalDuration: duration };
    }

    const filename = `${randomUUID()}.mp4`;
    const outputPath = path.join(mediaTempDir, filename);
    await trimVideo(downloadedPath, outputPath, maxSeconds);
    return { url: `${publicBaseUrl}/media/${filename}`, trimmed: true, originalDuration: duration };
  } finally {
    fs.unlink(downloadedPath, () => {});
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
// Buffer/Postiz can fetch. Mirrors trimVideoUrlIfNeeded's shape/cleanup.
async function resizeVideoUrlIfNeeded(videoUrl, minWidth, minHeight, publicBaseUrl) {
  const { path: downloadedPath } = await downloadTemp(videoUrl);
  try {
    const filename = `${randomUUID()}.mp4`;
    const outputPath = path.join(mediaTempDir, filename);
    const result = await upscaleToMinimumIfNeeded(downloadedPath, minWidth, minHeight, outputPath);
    if (!result.resized) return { url: videoUrl, resized: false };
    return { url: `${publicBaseUrl}/media/${filename}`, resized: true };
  } finally {
    fs.unlink(downloadedPath, () => {});
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
