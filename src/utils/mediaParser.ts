import { PlatformType, UniversalMediaItem, MediaFormat, TeraboxFile } from '../types';

/**
 * Detects the media platform from a given URL string.
 */
export function detectPlatform(inputUrl: string): PlatformType {
  if (!inputUrl) return 'aio';
  const url = inputUrl.trim().toLowerCase();

  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com')) {
    return 'youtube';
  }
  if (
    url.includes('terabox.com') ||
    url.includes('1024tera.com') ||
    url.includes('teraboxapp.com') ||
    url.includes('dubox.com')
  ) {
    return 'terabox';
  }
  if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
    return 'facebook';
  }
  if (url.includes('instagram.com') || url.includes('instagr.am')) {
    return 'instagram';
  }
  if (url.includes('tiktok.com')) {
    return 'tiktok';
  }
  if (url.includes('pinterest.com') || url.includes('pin.it')) {
    return 'pinterest';
  }
  if (url.includes('xnxx.com')) {
    return 'xnxx';
  }
  if (url.includes('xvideos.com')) {
    return 'xvideos';
  }

  return 'aio';
}

/**
 * Formats raw byte counts into human-readable strings (e.g. 7.02 MB).
 */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) {
    return 'Unknown size';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} Bytes`;
  const sizeIdx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, sizeIdx)).toFixed(2))} ${sizes[sizeIdx]}`;
}

/**
 * Formats a duration in seconds into MM:SS or HH:MM:SS.
 */
export function formatDuration(secondsOrStr?: number | string): string {
  if (!secondsOrStr) return '0:00';
  if (typeof secondsOrStr === 'string' && secondsOrStr.includes(':')) {
    return secondsOrStr;
  }
  const totalSecs = Math.floor(Number(secondsOrStr));
  if (isNaN(totalSecs) || totalSecs <= 0) return '0:00';

  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const paddedSecs = seconds < 10 ? `0${seconds}` : `${seconds}`;
  if (hours > 0) {
    const paddedMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

interface UrlCandidate {
  url: string;
  label: string;
  quality?: string;
  resolution?: string;
  extension?: string;
  fileSizeBytes?: number;
  fps?: number;
  formatNote?: string;
}

function asHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function firstHttpUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const url = asHttpUrl(value);
    if (url) return url;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function urlExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(pathname);
    const ext = match?.[1]?.toLowerCase();
    if (ext && ['mp4', 'mp3', 'm4a', 'webm', 'mov', 'mkv', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'm3u8'].includes(ext)) {
      return ext;
    }
  } catch {
    // ignore
  }
  return '';
}

function guessExtension(url: string, fallback = 'mp4'): string {
  const fromUrl = urlExtension(url);
  if (fromUrl) return fromUrl;
  if (url.includes('.m3u8')) return 'm3u8';
  return fallback;
}

function isImageUrl(url: string): boolean {
  const ext = urlExtension(url);
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext);
}

function isAudioUrl(url: string): boolean {
  const ext = urlExtension(url);
  return ['mp3', 'm4a'].includes(ext);
}

function makeFormat(candidate: UrlCandidate, idPrefix: string, index: number): MediaFormat {
  const extension = candidate.extension || guessExtension(candidate.url);
  return {
    id: `${idPrefix}_${index}`,
    label: candidate.label,
    quality: candidate.quality,
    resolution: candidate.resolution,
    extension,
    fileSizeBytes: candidate.fileSizeBytes,
    fileSizeFormatted: candidate.fileSizeBytes ? formatBytes(candidate.fileSizeBytes) : undefined,
    url: candidate.url,
    directStreamable: extension !== 'm3u8' || candidate.url.includes('.m3u8'),
    fps: candidate.fps,
    formatNote: candidate.formatNote,
  };
}

function pushFormat(target: MediaFormat[], seen: Set<string>, format: MediaFormat): void {
  if (!format.url || seen.has(format.url)) return;
  seen.add(format.url);
  target.push(format);
}

function collectArrayCandidates(
  value: unknown,
  labelPrefix: string,
  defaultTypeHint?: 'video' | 'audio' | 'image'
): UrlCandidate[] {
  if (!Array.isArray(value)) return [];
  const results: UrlCandidate[] = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const url = asHttpUrl(entry);
      if (url) {
        results.push({
          url,
          label: `${labelPrefix} (${guessExtension(url).toUpperCase()})`,
          extension: guessExtension(url),
        });
      }
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, any>;
    const url = firstHttpUrl(
      item.download_url,
      item.downloadUrl,
      item.url,
      item.link,
      item.play,
      item.play_url,
      item.src,
      item.file
    );
    if (!url) continue;

    const typeHint =
      item.type === 2 || item.media_type === 'video' || item.video
        ? 'video'
        : item.type === 1 || item.media_type === 'image'
          ? 'image'
          : defaultTypeHint;

    const quality =
      firstString(item.quality, item.label, item.resolution, item.height && `${item.height}p`) ||
      (typeHint === 'image' ? 'Original resolution' : 'Default quality');

    results.push({
      url,
      label: `${firstString(item.label, item.name, item.format) || labelPrefix} (${guessExtension(
        url,
        typeHint === 'image' ? 'jpg' : typeHint === 'audio' ? 'mp3' : 'mp4'
      ).toUpperCase()})`,
      quality,
      resolution: firstString(item.resolution, item.height && `${item.height}p`),
      extension: firstString(item.ext, item.extension) || guessExtension(url, typeHint === 'image' ? 'jpg' : 'mp4'),
      fileSizeBytes: Number(item.filesize ?? item.file_size ?? item.size ?? item.sizeBytes) || undefined,
      fps: Number(item.fps) || undefined,
    });
  }

  return results;
}

/**
 * Safely normalizes responses from various media endpoints into a unified UniversalMediaItem.
 */
export function normalizeMediaResponse(
  platform: PlatformType,
  rawData: any,
  originalUrl: string
): UniversalMediaItem {
  const fallbackId = `media_${Date.now()}`;

  const result: UniversalMediaItem = {
    id: fallbackId,
    title: 'Extracted Media',
    platform,
    sourceUrl: originalUrl,
    mediaType: 'video',
    streams: [],
    downloads: [],
    raw: rawData,
  };

  if (!rawData) return result;

  const seenDownloads = new Set<string>();
  const seenStreams = new Set<string>();

  /* ------------------------------------------------------------------------
     1. TERABOX
     ------------------------------------------------------------------------ */
  if (platform === 'terabox' || rawData.data?.rootPath || rawData.rootPath) {
    const tData = rawData.data || rawData;
    const rawFiles: any[] = Array.isArray(tData.files)
      ? tData.files
      : Array.isArray(tData.list)
        ? tData.list
        : Array.isArray(rawData.files)
          ? rawData.files
          : [];

    const files: TeraboxFile[] = rawFiles.map((file: any, index: number) => {
      const filename = String(file.filename || file.server_filename || file.name || `File_${index + 1}`);
      const streamUrl = firstHttpUrl(
        file.streamUrl,
        file.dlink,
        file.download_url,
        file.downloadUrl,
        file.url,
        file.play_url
      );
      const sizeBytes = Number(file.sizeBytes ?? file.size ?? file.file_size ?? 0) || 0;
      const ext = urlExtension(filename) || filename.split('.').pop() || '';
      const isVideo = ['mp4', 'mkv', 'mov', 'webm', 'm3u8', 'avi'].includes(ext);
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext);

      return {
        fsId: file.fsId || file.fs_id || index,
        filename,
        path: String(file.path || file.server_path || ''),
        sizeBytes,
        sizeFormatted: file.sizeFormatted || formatBytes(sizeBytes),
        category: isVideo ? 'video' : isImage ? 'photo' : 'other',
        thumbnail: firstHttpUrl(file.thumbnail, file.thumbs?.url3, file.thumbs?.url2, file.thumbs?.url1),
        streamUrl,
        md5: file.md5 || '',
      };
    });

    const firstVideo = files.find(file => file.category === 'video');
    const firstPlayable = firstVideo || files[0];

    result.title =
      firstString(tData.rootPath, tData.title, files[0]?.filename)?.replace(/^\//, '') ||
      'Terabox Cloud Media';
    result.thumbnail = firstPlayable?.thumbnail || '';
    result.mediaType = files.length > 1 ? 'folder' : firstVideo ? 'video' : 'image';
    result.streamUrl = firstPlayable?.streamUrl || '';
    result.teraboxData = {
      shareId: tData.shareId || tData.share_id || '',
      rootPath: tData.rootPath || '',
      totals: tData.totals || {
        items: files.length,
        folders: files.filter(file => file.category === 'other').length,
        videos: files.filter(file => file.category === 'video').length,
        photos: files.filter(file => file.category === 'photo').length,
      },
      files,
    };

    files.forEach((file, index) => {
      if (!file.streamUrl) return;
      const isVideo = file.category === 'video';
      const fmt = makeFormat(
        {
          url: file.streamUrl,
          label: `${file.filename} (${file.sizeFormatted})`,
          quality: isVideo ? 'Cloud video stream' : 'Cloud file',
          extension: file.filename.split('.').pop() || (isVideo ? 'mp4' : 'jpg'),
          fileSizeBytes: file.sizeBytes,
        },
        'tb',
        index
      );
      fmt.directStreamable = isVideo;
      pushFormat(result.downloads, seenDownloads, fmt);
      if (isVideo) pushFormat(result.streams, seenStreams, fmt);
    });

    return result;
  }

  /* ------------------------------------------------------------------------
     2. FACEBOOK
     ------------------------------------------------------------------------ */
  if (platform === 'facebook') {
    const fbData = rawData.data || rawData;
    const root = Array.isArray(fbData) ? fbData[0] || {} : fbData;
    result.title = firstString(root.title, root.description, 'Facebook Video') || 'Facebook Video';
    result.thumbnail = firstHttpUrl(root.thumbnail, root.thumb, root.image) || '';
    result.duration = firstString(root.duration, root.duration_string);
    result.author = firstString(root.author, root.uploader, root.owner);
    result.mediaType = 'video';

    const candidates: UrlCandidate[] = [];
    const links = root.download_links || root.links || root.urls;
    if (Array.isArray(links)) {
      candidates.push(...collectArrayCandidates(links, 'MP4', 'video'));
    }
    const hd = firstHttpUrl(root.hd, root.hd_url, root.hdplay);
    const sd = firstHttpUrl(root.sd, root.sd_url, root.sdplay);
    const direct = firstHttpUrl(root.download_url, root.video_url, root.play, root.url);
    if (hd) candidates.push({ url: hd, label: 'MP4 — HD', quality: '720p (HD)', extension: 'mp4' });
    if (sd) candidates.push({ url: sd, label: 'MP4 — SD', quality: '360p (SD)', extension: 'mp4' });
    if (direct) candidates.push({ url: direct, label: 'MP4 — Default', quality: root.quality || 'Auto', extension: 'mp4' });

    candidates.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, 'fb', index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });

    result.streamUrl = result.streams[0]?.url || '';
    return result;
  }

  /* ------------------------------------------------------------------------
     3. YOUTUBE
     ------------------------------------------------------------------------ */
  if (platform === 'youtube') {
    const ytRoot = rawData.data || rawData;
    const info = ytRoot.info || ytRoot;
    const videoId = firstString(info.id, ytRoot.id);
    result.id = videoId || fallbackId;
    result.title = firstString(info.title, ytRoot.title, 'YouTube Media') || 'YouTube Media';
    result.thumbnail =
      firstHttpUrl(info.thumbnail, info.thumbnail_url, ytRoot.thumbnail) ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
    result.author = firstString(info.channel, info.uploader, info.author, ytRoot.channel);
    result.channelUrl = firstHttpUrl(info.channel_url, ytRoot.channel_url);
    result.duration = firstString(info.duration_string, ytRoot.duration_string) || formatDuration(info.duration);
    result.durationSeconds = Number(info.duration) || undefined;
    result.views = info.view_count ?? ytRoot.view_count ?? undefined;
    result.likes = info.like_count ?? ytRoot.like_count ?? undefined;
    result.uploadDate = firstString(info.upload_date, ytRoot.upload_date);
    result.description = firstString(info.description, ytRoot.description);

    const isAudioType =
      ytRoot.type === 'audio' ||
      ytRoot.ext === 'mp3' ||
      Boolean(ytRoot.abr) ||
      Boolean(ytRoot.audio_download_url && !ytRoot.download_url);
    result.mediaType = isAudioType ? 'audio' : 'video';

    const candidates: UrlCandidate[] = [];
    const primaryUrl = firstHttpUrl(ytRoot.download_url, ytRoot.url, info.download_url);
    if (primaryUrl) {
      const ext = firstString(ytRoot.ext, info.ext) || (isAudioType ? 'mp3' : 'mp4');
      candidates.push({
        url: primaryUrl,
        label: `${firstString(ytRoot.quality, isAudioType ? 'High quality audio' : 'Best quality video')} (${ext.toUpperCase()})`,
        quality: firstString(ytRoot.quality, isAudioType ? 'Audio' : 'Best'),
        extension: ext,
        fileSizeBytes: Number(ytRoot.filesize ?? ytRoot.file_size) || undefined,
        fps: Number(ytRoot.fps) || undefined,
      });
    }

    const qualities = ytRoot.qualities || ytRoot.formats;
    if (Array.isArray(qualities)) {
      candidates.push(...collectArrayCandidates(qualities, 'Format', isAudioType ? 'audio' : 'video'));
    }

    const audioUrl = firstHttpUrl(ytRoot.audio_download_url, info.audio_download_url);
    if (audioUrl) {
      candidates.push({
        url: audioUrl,
        label: 'Audio only (MP3)',
        quality: 'Audio',
        extension: 'mp3',
      });
    }

    candidates.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, index === 0 ? 'yt_primary' : 'yt_q', index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });

    result.streamUrl = result.streams[0]?.url || '';
    return result;
  }

  /* ------------------------------------------------------------------------
     4. PINTEREST
     ------------------------------------------------------------------------ */
  if (platform === 'pinterest') {
    const pData = rawData.data ?? rawData;
    const imageUrls: string[] = [];
    const candidates: UrlCandidate[] = [];

    const addPin = (entry: unknown, index: number) => {
      if (typeof entry === 'string') {
        const url = asHttpUrl(entry);
        if (url) {
          imageUrls.push(url);
          candidates.push({
            url,
            label: `Image ${index + 1} (full resolution)`,
            quality: 'Original resolution',
            extension: guessExtension(url, 'jpg'),
          });
        }
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const item = entry as Record<string, any>;
      const image = firstHttpUrl(item.image, item.imageUrl, item.url, item.thumbnail, item.thumb);
      const video = firstHttpUrl(item.video, item.video_url, item.download_url);
      if (image) imageUrls.push(image);
      if (video) {
        candidates.push({
          url: video,
          label: `Video ${index + 1} (MP4)`,
          quality: 'Video',
          extension: 'mp4',
        });
      } else if (image) {
        candidates.push({
          url: image,
          label: `Image ${index + 1} (full resolution)`,
          quality: item.quality || 'Original resolution',
          extension: guessExtension(image, 'jpg'),
        });
      }
    };

    if (Array.isArray(pData)) {
      pData.forEach(addPin);
    } else if (Array.isArray(pData.pins)) {
      pData.pins.forEach(addPin);
    } else if (Array.isArray(pData.images)) {
      pData.images.forEach(addPin);
    } else {
      addPin(pData, 0);
    }

    const uniqueImages = Array.from(new Set(imageUrls));
    result.title = firstString(pData?.title, pData?.description, 'Pinterest Media') || 'Pinterest Media';
    result.thumbnail = uniqueImages[0] || '';
    result.author = firstString(pData?.author, pData?.username, pData?.uploader);

    candidates.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, 'pin', index);
      pushFormat(result.downloads, seenDownloads, fmt);
      if (!isImageUrl(candidate.url)) pushFormat(result.streams, seenStreams, fmt);
    });

    if (uniqueImages.length > 0) {
      result.galleryImages = uniqueImages;
      result.mediaType = result.downloads.some(item => item.extension === 'mp4') ? 'video' : 'gallery';
    } else {
      result.mediaType = result.downloads.some(item => item.extension === 'mp4') ? 'video' : 'image';
    }

    result.streamUrl = result.streams[0]?.url || '';
    return result;
  }

  /* ------------------------------------------------------------------------
     5. XNXX & XVIDEOS
     ------------------------------------------------------------------------ */
  if (platform === 'xnxx' || platform === 'xvideos') {
    result.title = firstString(rawData.title, platform === 'xnxx' ? 'XNXX Video' : 'Xvideos Video') || '';
    result.duration = formatDuration(rawData.duration);
    result.author = firstString(rawData.uploader?.name, rawData.uploader, rawData.author);
    result.mediaType = 'video';

    let resolvedThumb = firstHttpUrl(rawData.image, rawData.thumb, rawData.thumbnail) || '';
    if (!resolvedThumb || resolvedThumb.includes('blank.gif') || resolvedThumb.length < 12) {
      const sampleUrl =
        firstHttpUrl(rawData.best?.url, rawData.hls, rawData.qualities?.[0]?.url) || '';
      const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(sampleUrl)?.[1];
      if (uuid) {
        resolvedThumb =
          platform === 'xvideos' || sampleUrl.includes('xvideos')
            ? `https://thumbs-gcore.xvideos-cdn.com/${uuid}/0/xv_4_t.jpg`
            : `https://thumbs-gcore.xnxx-cdn.com/${uuid}/0/xn_4_t.jpg`;
      }
    }
    result.thumbnail = resolvedThumb;

    const candidates: UrlCandidate[] = [];
    if (Array.isArray(rawData.qualities)) {
      candidates.push(...collectArrayCandidates(rawData.qualities, 'MP4', 'video'));
    }
    if (rawData.best?.url) {
      const bestUrl = firstHttpUrl(rawData.best.url);
      if (bestUrl) {
        candidates.push({
          url: bestUrl,
          label: `MP4 — ${firstString(rawData.best.quality, 'Best quality')}`,
          quality: firstString(rawData.best.quality, 'Best'),
          extension: 'mp4',
        });
      }
    }
    if (rawData.hls) {
      const hls = firstHttpUrl(rawData.hls);
      if (hls) {
        candidates.push({
          url: hls,
          label: 'Adaptive HLS stream (auto quality)',
          quality: 'HLS Auto',
          extension: 'm3u8',
          formatNote: 'HLS',
        });
      }
    }

    candidates.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, platform, index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });

    result.streamUrl = result.streams.find(item => item.extension === 'mp4')?.url || result.streams[0]?.url || '';
    return result;
  }

  /* ------------------------------------------------------------------------
     6. TIKTOK, INSTAGRAM, AIO & GENERIC
     ------------------------------------------------------------------------ */
  const rootData = rawData.data ?? rawData;
  const root = Array.isArray(rootData) ? rootData[0] || {} : rootData;

  result.title =
    firstString(root.title, root.caption, root.desc, root.description, `${platform.toUpperCase()} Media`) ||
    'Extracted Media';
  result.thumbnail = firstHttpUrl(root.thumbnail, root.cover, root.image, root.avatar, root.thumbnail_url) || '';
  result.author =
    firstString(
      root.author?.nickname,
      root.author?.unique_id,
      root.author?.name,
      root.author,
      root.username,
      root.uploader?.name,
      root.uploader,
      root.owner
    ) || '';
  result.duration = firstString(root.duration_string, root.duration ? formatDuration(root.duration) : '');
  result.views = root.view_count ?? root.play_count ?? root.views ?? undefined;
  result.likes = root.like_count ?? root.digg_count ?? root.likes ?? undefined;
  result.description = firstString(root.description, root.caption, root.desc);

  const candidates: UrlCandidate[] = [];
  const imageUrls: string[] = [];

  const addCandidate = (url: string | null | undefined, label: string, quality?: string, ext?: string) => {
    if (!url) return;
    if (isImageUrl(url) && !/video|play|download/i.test(label)) {
      imageUrls.push(url);
      return;
    }
    candidates.push({
      url,
      label: `${label} (${(ext || guessExtension(url, isAudioUrl(url) ? 'mp3' : 'mp4')).toUpperCase()})`,
      quality,
      extension: ext || guessExtension(url, isAudioUrl(url) ? 'mp3' : 'mp4'),
    });
  };

  addCandidate(
    firstHttpUrl(root.hd, root.hdplay, root.hd_url, root.video_hd),
    'HD video',
    'HD 1080p',
    'mp4'
  );
  addCandidate(
    firstHttpUrl(root.sd, root.sdplay, root.sd_url, root.video_sd),
    'SD video',
    'SD 480p',
    'mp4'
  );
  addCandidate(
    firstHttpUrl(root.play, root.video_url, root.videoUrl, root.download_url, root.downloadUrl, root.url, root.src),
    'Video',
    'Default quality',
    'mp4'
  );

  if (Array.isArray(root.video_versions)) {
    collectArrayCandidates(root.video_versions, 'Video', 'video').forEach(candidate => {
      candidates.push({
        ...candidate,
        label: `${candidate.label}`,
      });
    });
  }

  if (Array.isArray(root.medias)) {
    root.medias.forEach((media: any, index: number) => {
      const url = firstHttpUrl(media.url, media.download_url, media.src);
      if (!url) return;
      const isVideo = media.type === 2 || media.media_type === 'video' || media.video === true;
      if (isVideo) {
        candidates.push({
          url,
          label: `Media ${index + 1} (${guessExtension(url, 'mp4').toUpperCase()})`,
          quality: firstString(media.quality, media.height && `${media.height}p`) || 'Default quality',
          extension: guessExtension(url, 'mp4'),
        });
      } else {
        imageUrls.push(url);
      }
    });
  }

  if (Array.isArray(root.urls)) {
    root.urls.forEach((entry: any, index: number) => {
      const url = typeof entry === 'string' ? asHttpUrl(entry) : firstHttpUrl(entry?.url);
      if (url) {
        addCandidate(url, `Media ${index + 1}`, entry?.quality, entry?.ext);
      }
    });
  }

  if (Array.isArray(root.links)) {
    collectArrayCandidates(root.links, 'Media', 'video').forEach(candidate => candidates.push(candidate));
  }

  if (Array.isArray(root.formats)) {
    collectArrayCandidates(root.formats, 'Format', 'video').forEach(candidate => candidates.push(candidate));
  }

  const audioUrl = firstHttpUrl(
    root.music?.play_url,
    root.music?.url,
    root.audio_url,
    root.audio,
    root.sound
  );
  if (audioUrl) {
    candidates.push({
      url: audioUrl,
      label: 'Audio track (MP3)',
      quality: 'Original audio',
      extension: 'mp3',
    });
  }

  if (Array.isArray(rootData) && rootData.length > 1) {
    rootData.forEach(entry => {
      if (typeof entry === 'string') {
        const url = asHttpUrl(entry);
        if (url) imageUrls.push(url);
      } else if (entry && typeof entry === 'object') {
        const image = firstHttpUrl((entry as any).image, (entry as any).url, (entry as any).thumbnail);
        if (image) imageUrls.push(image);
      }
    });
  }

  const uniqueImages = Array.from(new Set(imageUrls.filter(Boolean)));
  candidates.forEach((candidate, index) => {
    const fmt = makeFormat(candidate, 'gen', index);
    pushFormat(result.downloads, seenDownloads, fmt);
    if (fmt.directStreamable && !isImageUrl(fmt.url)) {
      pushFormat(result.streams, seenStreams, fmt);
    }
  });

  if (uniqueImages.length > 0) {
    result.galleryImages = uniqueImages;
    uniqueImages.forEach((url, index) => {
      const fmt: MediaFormat = {
        id: `gen_img_${index}`,
        label: `Image ${index + 1} (${guessExtension(url, 'jpg').toUpperCase()})`,
        quality: 'Original resolution',
        extension: guessExtension(url, 'jpg'),
        url,
        directStreamable: false,
      };
      pushFormat(result.downloads, seenDownloads, fmt);
    });
  }

  if (result.streams.length > 0) {
    result.mediaType = result.streams.every(item => item.extension === 'mp3') ? 'audio' : 'video';
    result.streamUrl = result.streams[0].url;
  } else if (uniqueImages.length > 1) {
    result.mediaType = 'gallery';
    result.thumbnail = result.thumbnail || uniqueImages[0];
    result.streamUrl = '';
  } else if (uniqueImages.length === 1) {
    result.mediaType = 'image';
    result.thumbnail = result.thumbnail || uniqueImages[0];
    result.streamUrl = '';
  } else if (result.thumbnail) {
    result.mediaType = 'image';
  }

  return result;
}
