import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, formatBytes, formatDuration, normalizeMediaResponse } from './mediaParser';

test('detectPlatform accurately identifies URLs from various domains', () => {
  assert.equal(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatform('https://www.1024tera.com/s/1pLY_llmDlklU2tYse8gEig'), 'terabox');
  assert.equal(detectPlatform('https://terabox.com/s/123xyz'), 'terabox');
  assert.equal(detectPlatform('https://www.facebook.com/reel/123456789'), 'facebook');
  assert.equal(detectPlatform('https://fb.watch/xyz/'), 'facebook');
  assert.equal(detectPlatform('https://www.instagram.com/p/C8_dummy/'), 'instagram');
  assert.equal(detectPlatform('https://www.tiktok.com/@creator/video/12345'), 'tiktok');
  assert.equal(detectPlatform('https://www.pinterest.com/pin/123456/'), 'pinterest');
  assert.equal(detectPlatform('https://pin.it/abc123'), 'pinterest');
  assert.equal(detectPlatform('https://www.xnxx.com/video-xivgl58/thick_stepsister'), 'xnxx');
  assert.equal(detectPlatform('https://www.xvideos.com/video.kfoudiff3bb/_'), 'xvideos');
  assert.equal(detectPlatform('https://randomwebsite.com/video.mp4'), 'aio');
});

test('formatBytes converts raw byte amounts into human readable units', () => {
  assert.equal(formatBytes(0), 'Unknown size');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(7357257), '7.02 MB');
  assert.equal(formatBytes(1073741824), '1 GB');
});

test('formatDuration converts numbers and strings to formatted time', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3665), '1:01:05');
  assert.equal(formatDuration('3:39:12'), '3:39:12');
});

test('normalizeMediaResponse parses YouTube ytmp4 data correctly', () => {
  const mockYtData = {
    status: true,
    statusCode: 200,
    type: 'video',
    download_url: 'https://video.google.com/1080p.mp4',
    quality: '1080p',
    ext: 'mp4',
    filesize: 104857600,
    info: {
      id: 'mock123',
      title: 'Awesome Song Music Video',
      channel: 'Artist Official',
      duration: 215,
      duration_string: '3:35',
      thumbnail: 'https://img.youtube.com/vi/mock123/0.jpg',
    },
    qualities: [
      {
        format_id: '137',
        quality: '1080p',
        ext: 'mp4',
        filesize: 104857600,
        download_url: 'https://video.google.com/1080p.mp4',
      },
      {
        format_id: '22',
        quality: '720p',
        ext: 'mp4',
        filesize: 52428800,
        download_url: 'https://video.google.com/720p.mp4',
      },
    ],
  };

  const parsed = normalizeMediaResponse('youtube', mockYtData, 'https://youtube.com/watch?v=mock123');
  assert.equal(parsed.title, 'Awesome Song Music Video');
  assert.equal(parsed.author, 'Artist Official');
  assert.equal(parsed.mediaType, 'video');
  assert.equal(parsed.duration, '3:35');
  assert.equal(parsed.streamUrl, 'https://video.google.com/1080p.mp4');
  assert.ok(parsed.downloads.length >= 2);
  assert.equal(parsed.downloads[0].quality, '1080p');
});

test('normalizeMediaResponse parses Terabox folder data correctly', () => {
  const mockTeraData = {
    status: true,
    statusCode: 200,
    data: {
      shareId: 543140331939,
      rootPath: '/abs/ERINE CHINDO',
      totals: { items: 2, folders: 0, videos: 1, photos: 1 },
      files: [
        {
          fsId: 866129749372554,
          filename: 'Video1.mp4',
          path: '/abs/ERINE CHINDO/Video1.mp4',
          sizeBytes: 7357257,
          sizeFormatted: '7.02 MB',
          category: 'video',
          thumbnail: 'https://thumb.1024tera.com/v1.jpg',
          streamUrl: 'https://streaming.1024tera.com/video1.m3u8',
        },
        {
          fsId: 866129749372555,
          filename: 'Photo1.jpg',
          path: '/abs/ERINE CHINDO/Photo1.jpg',
          sizeBytes: 245000,
          sizeFormatted: '239 KB',
          category: 'photo',
          thumbnail: 'https://thumb.1024tera.com/p1.jpg',
          streamUrl: 'https://download.1024tera.com/photo1.jpg',
        },
      ],
    },
  };

  const parsed = normalizeMediaResponse('terabox', mockTeraData, 'https://1024tera.com/s/sample');
  assert.equal(parsed.mediaType, 'folder');
  assert.ok(parsed.teraboxData);
  assert.equal(parsed.teraboxData?.files.length, 2);
  assert.equal(parsed.teraboxData?.files[0].filename, 'Video1.mp4');
  assert.equal(parsed.teraboxData?.files[0].streamUrl, 'https://streaming.1024tera.com/video1.m3u8');
  assert.equal(parsed.streams.length, 1);
  assert.equal(parsed.downloads.length, 2);
});
