// server.ts
import express from "express";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
import fs2 from "node:fs";
import net2 from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import dotenv from "dotenv";

// src/utils/mediaParser.ts
function detectPlatform(inputUrl) {
  if (!inputUrl) return "aio";
  const url = inputUrl.trim().toLowerCase();
  if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("youtube-nocookie.com")) {
    return "youtube";
  }
  if (url.includes("terabox.com") || url.includes("1024tera.com") || url.includes("teraboxapp.com") || url.includes("dubox.com")) {
    return "terabox";
  }
  if (url.includes("facebook.com") || url.includes("fb.watch") || url.includes("fb.com")) {
    return "facebook";
  }
  if (url.includes("instagram.com") || url.includes("instagr.am")) {
    return "instagram";
  }
  if (url.includes("tiktok.com")) {
    return "tiktok";
  }
  if (url.includes("pinterest.com") || url.includes("pin.it")) {
    return "pinterest";
  }
  if (url.includes("xnxx.com")) {
    return "xnxx";
  }
  if (url.includes("xvideos.com")) {
    return "xvideos";
  }
  return "aio";
}
function formatBytes(bytes) {
  if (bytes === void 0 || bytes === null || isNaN(bytes) || bytes === 0) {
    return "Unknown size";
  }
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} Bytes`;
  const sizeIdx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, sizeIdx)).toFixed(2))} ${sizes[sizeIdx]}`;
}
function formatDuration(secondsOrStr) {
  if (!secondsOrStr) return "0:00";
  if (typeof secondsOrStr === "string" && secondsOrStr.includes(":")) {
    return secondsOrStr;
  }
  const totalSecs = Math.floor(Number(secondsOrStr));
  if (isNaN(totalSecs) || totalSecs <= 0) return "0:00";
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor(totalSecs % 3600 / 60);
  const seconds = totalSecs % 60;
  const paddedSecs = seconds < 10 ? `0${seconds}` : `${seconds}`;
  if (hours > 0) {
    const paddedMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}
function asHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}
function firstHttpUrl(...values) {
  for (const value of values) {
    const url = asHttpUrl(value);
    if (url) return url;
  }
  return void 0;
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return void 0;
}
function urlExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(pathname);
    const ext = match?.[1]?.toLowerCase();
    if (ext && ["mp4", "mp3", "m4a", "webm", "mov", "mkv", "jpg", "jpeg", "png", "webp", "gif", "avif", "m3u8"].includes(ext)) {
      return ext;
    }
  } catch {
  }
  return "";
}
function guessExtension(url, fallback = "mp4") {
  const fromUrl = urlExtension(url);
  if (fromUrl) return fromUrl;
  if (url.includes(".m3u8")) return "m3u8";
  return fallback;
}
function isImageUrl(url) {
  const ext = urlExtension(url);
  return ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext);
}
function isAudioUrl(url) {
  const ext = urlExtension(url);
  return ["mp3", "m4a"].includes(ext);
}
function makeFormat(candidate, idPrefix, index) {
  const extension = candidate.extension || guessExtension(candidate.url);
  return {
    id: `${idPrefix}_${index}`,
    label: candidate.label,
    quality: candidate.quality,
    resolution: candidate.resolution,
    extension,
    fileSizeBytes: candidate.fileSizeBytes,
    fileSizeFormatted: candidate.fileSizeBytes ? formatBytes(candidate.fileSizeBytes) : void 0,
    url: candidate.url,
    directStreamable: extension !== "m3u8" || candidate.url.includes(".m3u8"),
    fps: candidate.fps,
    formatNote: candidate.formatNote
  };
}
function pushFormat(target, seen, format) {
  if (!format.url || seen.has(format.url)) return;
  seen.add(format.url);
  target.push(format);
}
function collectArrayCandidates(value, labelPrefix, defaultTypeHint) {
  if (!Array.isArray(value)) return [];
  const results = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const url2 = asHttpUrl(entry);
      if (url2) {
        results.push({
          url: url2,
          label: `${labelPrefix} (${guessExtension(url2).toUpperCase()})`,
          extension: guessExtension(url2)
        });
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const item = entry;
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
    const typeHint = item.type === 2 || item.media_type === "video" || item.video ? "video" : item.type === 1 || item.media_type === "image" ? "image" : defaultTypeHint;
    const quality = firstString(item.quality, item.label, item.resolution, item.height && `${item.height}p`) || (typeHint === "image" ? "Original resolution" : "Default quality");
    results.push({
      url,
      label: `${firstString(item.label, item.name, item.format) || labelPrefix} (${guessExtension(
        url,
        typeHint === "image" ? "jpg" : typeHint === "audio" ? "mp3" : "mp4"
      ).toUpperCase()})`,
      quality,
      resolution: firstString(item.resolution, item.height && `${item.height}p`),
      extension: firstString(item.ext, item.extension) || guessExtension(url, typeHint === "image" ? "jpg" : "mp4"),
      fileSizeBytes: Number(item.filesize ?? item.file_size ?? item.size ?? item.sizeBytes) || void 0,
      fps: Number(item.fps) || void 0
    });
  }
  return results;
}
function normalizeMediaResponse(platform, rawData, originalUrl) {
  const fallbackId = `media_${Date.now()}`;
  const result = {
    id: fallbackId,
    title: "Extracted Media",
    platform,
    sourceUrl: originalUrl,
    mediaType: "video",
    streams: [],
    downloads: [],
    raw: rawData
  };
  if (!rawData) return result;
  const seenDownloads = /* @__PURE__ */ new Set();
  const seenStreams = /* @__PURE__ */ new Set();
  if (platform === "terabox" || rawData.data?.rootPath || rawData.rootPath) {
    const tData = rawData.data || rawData;
    const rawFiles = Array.isArray(tData.files) ? tData.files : Array.isArray(tData.list) ? tData.list : Array.isArray(rawData.files) ? rawData.files : [];
    const files = rawFiles.map((file, index) => {
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
      const ext = urlExtension(filename) || filename.split(".").pop() || "";
      const isVideo = ["mp4", "mkv", "mov", "webm", "m3u8", "avi"].includes(ext);
      const isImage = ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext);
      return {
        fsId: file.fsId || file.fs_id || index,
        filename,
        path: String(file.path || file.server_path || ""),
        sizeBytes,
        sizeFormatted: file.sizeFormatted || formatBytes(sizeBytes),
        category: isVideo ? "video" : isImage ? "photo" : "other",
        thumbnail: firstHttpUrl(file.thumbnail, file.thumbs?.url3, file.thumbs?.url2, file.thumbs?.url1),
        streamUrl,
        md5: file.md5 || ""
      };
    });
    const firstVideo = files.find((file) => file.category === "video");
    const firstPlayable = firstVideo || files[0];
    result.title = firstString(tData.rootPath, tData.title, files[0]?.filename)?.replace(/^\//, "") || "Terabox Cloud Media";
    result.thumbnail = firstPlayable?.thumbnail || "";
    result.mediaType = files.length > 1 ? "folder" : firstVideo ? "video" : "image";
    result.streamUrl = firstPlayable?.streamUrl || "";
    result.teraboxData = {
      shareId: tData.shareId || tData.share_id || "",
      rootPath: tData.rootPath || "",
      totals: tData.totals || {
        items: files.length,
        folders: files.filter((file) => file.category === "other").length,
        videos: files.filter((file) => file.category === "video").length,
        photos: files.filter((file) => file.category === "photo").length
      },
      files
    };
    files.forEach((file, index) => {
      if (!file.streamUrl) return;
      const isVideo = file.category === "video";
      const fmt = makeFormat(
        {
          url: file.streamUrl,
          label: `${file.filename} (${file.sizeFormatted})`,
          quality: isVideo ? "Cloud video stream" : "Cloud file",
          extension: file.filename.split(".").pop() || (isVideo ? "mp4" : "jpg"),
          fileSizeBytes: file.sizeBytes
        },
        "tb",
        index
      );
      fmt.directStreamable = isVideo;
      pushFormat(result.downloads, seenDownloads, fmt);
      if (isVideo) pushFormat(result.streams, seenStreams, fmt);
    });
    return result;
  }
  if (platform === "facebook") {
    const fbData = rawData.data || rawData;
    const root2 = Array.isArray(fbData) ? fbData[0] || {} : fbData;
    result.title = firstString(root2.title, root2.description, "Facebook Video") || "Facebook Video";
    result.thumbnail = firstHttpUrl(root2.thumbnail, root2.thumb, root2.image) || "";
    result.duration = firstString(root2.duration, root2.duration_string);
    result.author = firstString(root2.author, root2.uploader, root2.owner);
    result.mediaType = "video";
    const candidates2 = [];
    const links = root2.download_links || root2.links || root2.urls;
    if (Array.isArray(links)) {
      candidates2.push(...collectArrayCandidates(links, "MP4", "video"));
    }
    const hd = firstHttpUrl(root2.hd, root2.hd_url, root2.hdplay);
    const sd = firstHttpUrl(root2.sd, root2.sd_url, root2.sdplay);
    const direct = firstHttpUrl(root2.download_url, root2.video_url, root2.play, root2.url);
    if (hd) candidates2.push({ url: hd, label: "MP4 \u2014 HD", quality: "720p (HD)", extension: "mp4" });
    if (sd) candidates2.push({ url: sd, label: "MP4 \u2014 SD", quality: "360p (SD)", extension: "mp4" });
    if (direct) candidates2.push({ url: direct, label: "MP4 \u2014 Default", quality: root2.quality || "Auto", extension: "mp4" });
    candidates2.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, "fb", index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });
    result.streamUrl = result.streams[0]?.url || "";
    return result;
  }
  if (platform === "youtube") {
    const ytRoot = rawData.data || rawData;
    const info = ytRoot.info || ytRoot;
    const videoId = firstString(info.id, ytRoot.id);
    result.id = videoId || fallbackId;
    result.title = firstString(info.title, ytRoot.title, "YouTube Media") || "YouTube Media";
    result.thumbnail = firstHttpUrl(info.thumbnail, info.thumbnail_url, ytRoot.thumbnail) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
    result.author = firstString(info.channel, info.uploader, info.author, ytRoot.channel);
    result.channelUrl = firstHttpUrl(info.channel_url, ytRoot.channel_url);
    result.duration = firstString(info.duration_string, ytRoot.duration_string) || formatDuration(info.duration);
    result.durationSeconds = Number(info.duration) || void 0;
    result.views = info.view_count ?? ytRoot.view_count ?? void 0;
    result.likes = info.like_count ?? ytRoot.like_count ?? void 0;
    result.uploadDate = firstString(info.upload_date, ytRoot.upload_date);
    result.description = firstString(info.description, ytRoot.description);
    const isAudioType = ytRoot.type === "audio" || ytRoot.ext === "mp3" || Boolean(ytRoot.abr) || Boolean(ytRoot.audio_download_url && !ytRoot.download_url);
    result.mediaType = isAudioType ? "audio" : "video";
    const candidates2 = [];
    const primaryUrl = firstHttpUrl(ytRoot.download_url, ytRoot.url, info.download_url);
    if (primaryUrl) {
      const ext = firstString(ytRoot.ext, info.ext) || (isAudioType ? "mp3" : "mp4");
      candidates2.push({
        url: primaryUrl,
        label: `${firstString(ytRoot.quality, isAudioType ? "High quality audio" : "Best quality video")} (${ext.toUpperCase()})`,
        quality: firstString(ytRoot.quality, isAudioType ? "Audio" : "Best"),
        extension: ext,
        fileSizeBytes: Number(ytRoot.filesize ?? ytRoot.file_size) || void 0,
        fps: Number(ytRoot.fps) || void 0
      });
    }
    const qualities = ytRoot.qualities || ytRoot.formats;
    if (Array.isArray(qualities)) {
      candidates2.push(...collectArrayCandidates(qualities, "Format", isAudioType ? "audio" : "video"));
    }
    const audioUrl2 = firstHttpUrl(ytRoot.audio_download_url, info.audio_download_url);
    if (audioUrl2) {
      candidates2.push({
        url: audioUrl2,
        label: "Audio only (MP3)",
        quality: "Audio",
        extension: "mp3"
      });
    }
    candidates2.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, index === 0 ? "yt_primary" : "yt_q", index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });
    result.streamUrl = result.streams[0]?.url || "";
    return result;
  }
  if (platform === "pinterest") {
    const pData = rawData.data ?? rawData;
    const imageUrls2 = [];
    const candidates2 = [];
    const addPin = (entry, index) => {
      if (typeof entry === "string") {
        const url = asHttpUrl(entry);
        if (url) {
          imageUrls2.push(url);
          candidates2.push({
            url,
            label: `Image ${index + 1} (full resolution)`,
            quality: "Original resolution",
            extension: guessExtension(url, "jpg")
          });
        }
        return;
      }
      if (!entry || typeof entry !== "object") return;
      const item = entry;
      const image = firstHttpUrl(item.image, item.imageUrl, item.url, item.thumbnail, item.thumb);
      const video = firstHttpUrl(item.video, item.video_url, item.download_url);
      if (image) imageUrls2.push(image);
      if (video) {
        candidates2.push({
          url: video,
          label: `Video ${index + 1} (MP4)`,
          quality: "Video",
          extension: "mp4"
        });
      } else if (image) {
        candidates2.push({
          url: image,
          label: `Image ${index + 1} (full resolution)`,
          quality: item.quality || "Original resolution",
          extension: guessExtension(image, "jpg")
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
    const uniqueImages2 = Array.from(new Set(imageUrls2));
    result.title = firstString(pData?.title, pData?.description, "Pinterest Media") || "Pinterest Media";
    result.thumbnail = uniqueImages2[0] || "";
    result.author = firstString(pData?.author, pData?.username, pData?.uploader);
    candidates2.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, "pin", index);
      pushFormat(result.downloads, seenDownloads, fmt);
      if (!isImageUrl(candidate.url)) pushFormat(result.streams, seenStreams, fmt);
    });
    if (uniqueImages2.length > 0) {
      result.galleryImages = uniqueImages2;
      result.mediaType = result.downloads.some((item) => item.extension === "mp4") ? "video" : "gallery";
    } else {
      result.mediaType = result.downloads.some((item) => item.extension === "mp4") ? "video" : "image";
    }
    result.streamUrl = result.streams[0]?.url || "";
    return result;
  }
  if (platform === "xnxx" || platform === "xvideos") {
    result.title = firstString(rawData.title, platform === "xnxx" ? "XNXX Video" : "Xvideos Video") || "";
    result.duration = formatDuration(rawData.duration);
    result.author = firstString(rawData.uploader?.name, rawData.uploader, rawData.author);
    result.mediaType = "video";
    let resolvedThumb = firstHttpUrl(rawData.image, rawData.thumb, rawData.thumbnail) || "";
    if (!resolvedThumb || resolvedThumb.includes("blank.gif") || resolvedThumb.length < 12) {
      const sampleUrl = firstHttpUrl(rawData.best?.url, rawData.hls, rawData.qualities?.[0]?.url) || "";
      const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(sampleUrl)?.[1];
      if (uuid) {
        resolvedThumb = platform === "xvideos" || sampleUrl.includes("xvideos") ? `https://thumbs-gcore.xvideos-cdn.com/${uuid}/0/xv_4_t.jpg` : `https://thumbs-gcore.xnxx-cdn.com/${uuid}/0/xn_4_t.jpg`;
      }
    }
    result.thumbnail = resolvedThumb;
    const candidates2 = [];
    if (Array.isArray(rawData.qualities)) {
      candidates2.push(...collectArrayCandidates(rawData.qualities, "MP4", "video"));
    }
    if (rawData.best?.url) {
      const bestUrl = firstHttpUrl(rawData.best.url);
      if (bestUrl) {
        candidates2.push({
          url: bestUrl,
          label: `MP4 \u2014 ${firstString(rawData.best.quality, "Best quality")}`,
          quality: firstString(rawData.best.quality, "Best"),
          extension: "mp4"
        });
      }
    }
    if (rawData.hls) {
      const hls = firstHttpUrl(rawData.hls);
      if (hls) {
        candidates2.push({
          url: hls,
          label: "Adaptive HLS stream (auto quality)",
          quality: "HLS Auto",
          extension: "m3u8",
          formatNote: "HLS"
        });
      }
    }
    candidates2.forEach((candidate, index) => {
      const fmt = makeFormat(candidate, platform, index);
      pushFormat(result.downloads, seenDownloads, fmt);
      pushFormat(result.streams, seenStreams, fmt);
    });
    result.streamUrl = result.streams.find((item) => item.extension === "mp4")?.url || result.streams[0]?.url || "";
    return result;
  }
  const rootData = rawData.data ?? rawData;
  const root = Array.isArray(rootData) ? rootData[0] || {} : rootData;
  result.title = firstString(root.title, root.caption, root.desc, root.description, `${platform.toUpperCase()} Media`) || "Extracted Media";
  result.thumbnail = firstHttpUrl(root.thumbnail, root.cover, root.image, root.avatar, root.thumbnail_url) || "";
  result.author = firstString(
    root.author?.nickname,
    root.author?.unique_id,
    root.author?.name,
    root.author,
    root.username,
    root.uploader?.name,
    root.uploader,
    root.owner
  ) || "";
  result.duration = firstString(root.duration_string, root.duration ? formatDuration(root.duration) : "");
  result.views = root.view_count ?? root.play_count ?? root.views ?? void 0;
  result.likes = root.like_count ?? root.digg_count ?? root.likes ?? void 0;
  result.description = firstString(root.description, root.caption, root.desc);
  const candidates = [];
  const imageUrls = [];
  const addCandidate = (url, label, quality, ext) => {
    if (!url) return;
    if (isImageUrl(url) && !/video|play|download/i.test(label)) {
      imageUrls.push(url);
      return;
    }
    candidates.push({
      url,
      label: `${label} (${(ext || guessExtension(url, isAudioUrl(url) ? "mp3" : "mp4")).toUpperCase()})`,
      quality,
      extension: ext || guessExtension(url, isAudioUrl(url) ? "mp3" : "mp4")
    });
  };
  addCandidate(
    firstHttpUrl(root.hd, root.hdplay, root.hd_url, root.video_hd),
    "HD video",
    "HD 1080p",
    "mp4"
  );
  addCandidate(
    firstHttpUrl(root.sd, root.sdplay, root.sd_url, root.video_sd),
    "SD video",
    "SD 480p",
    "mp4"
  );
  addCandidate(
    firstHttpUrl(root.play, root.video_url, root.videoUrl, root.download_url, root.downloadUrl, root.url, root.src),
    "Video",
    "Default quality",
    "mp4"
  );
  if (Array.isArray(root.video_versions)) {
    collectArrayCandidates(root.video_versions, "Video", "video").forEach((candidate) => {
      candidates.push({
        ...candidate,
        label: `${candidate.label}`
      });
    });
  }
  if (Array.isArray(root.medias)) {
    root.medias.forEach((media, index) => {
      const url = firstHttpUrl(media.url, media.download_url, media.src);
      if (!url) return;
      const isVideo = media.type === 2 || media.media_type === "video" || media.video === true;
      if (isVideo) {
        candidates.push({
          url,
          label: `Media ${index + 1} (${guessExtension(url, "mp4").toUpperCase()})`,
          quality: firstString(media.quality, media.height && `${media.height}p`) || "Default quality",
          extension: guessExtension(url, "mp4")
        });
      } else {
        imageUrls.push(url);
      }
    });
  }
  if (Array.isArray(root.urls)) {
    root.urls.forEach((entry, index) => {
      const url = typeof entry === "string" ? asHttpUrl(entry) : firstHttpUrl(entry?.url);
      if (url) {
        addCandidate(url, `Media ${index + 1}`, entry?.quality, entry?.ext);
      }
    });
  }
  if (Array.isArray(root.links)) {
    collectArrayCandidates(root.links, "Media", "video").forEach((candidate) => candidates.push(candidate));
  }
  if (Array.isArray(root.formats)) {
    collectArrayCandidates(root.formats, "Format", "video").forEach((candidate) => candidates.push(candidate));
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
      label: "Audio track (MP3)",
      quality: "Original audio",
      extension: "mp3"
    });
  }
  if (Array.isArray(rootData) && rootData.length > 1) {
    rootData.forEach((entry) => {
      if (typeof entry === "string") {
        const url = asHttpUrl(entry);
        if (url) imageUrls.push(url);
      } else if (entry && typeof entry === "object") {
        const image = firstHttpUrl(entry.image, entry.url, entry.thumbnail);
        if (image) imageUrls.push(image);
      }
    });
  }
  const uniqueImages = Array.from(new Set(imageUrls.filter(Boolean)));
  candidates.forEach((candidate, index) => {
    const fmt = makeFormat(candidate, "gen", index);
    pushFormat(result.downloads, seenDownloads, fmt);
    if (fmt.directStreamable && !isImageUrl(fmt.url)) {
      pushFormat(result.streams, seenStreams, fmt);
    }
  });
  if (uniqueImages.length > 0) {
    result.galleryImages = uniqueImages;
    uniqueImages.forEach((url, index) => {
      const fmt = {
        id: `gen_img_${index}`,
        label: `Image ${index + 1} (${guessExtension(url, "jpg").toUpperCase()})`,
        quality: "Original resolution",
        extension: guessExtension(url, "jpg"),
        url,
        directStreamable: false
      };
      pushFormat(result.downloads, seenDownloads, fmt);
    });
  }
  if (result.streams.length > 0) {
    result.mediaType = result.streams.every((item) => item.extension === "mp3") ? "audio" : "video";
    result.streamUrl = result.streams[0].url;
  } else if (uniqueImages.length > 1) {
    result.mediaType = "gallery";
    result.thumbnail = result.thumbnail || uniqueImages[0];
    result.streamUrl = "";
  } else if (uniqueImages.length === 1) {
    result.mediaType = "image";
    result.thumbnail = result.thumbnail || uniqueImages[0];
    result.streamUrl = "";
  } else if (result.thumbnail) {
    result.mediaType = "image";
  }
  return result;
}

// src/db/sqlite.ts
import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
var dbClient = null;
var initPromise = null;
var databaseInfo = {
  url: "",
  remote: false,
  displayPath: ""
};
var DEFAULT_DB_FILENAME = "streampulse.db";
function resolveDatabaseTarget() {
  const explicitUrl = (process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "").trim();
  const authToken = (process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "").trim() || void 0;
  if (explicitUrl) {
    if (explicitUrl.startsWith("file:")) {
      const filePath2 = explicitUrl.slice("file:".length).replace(/^\/+/, process.platform === "win32" ? "" : "/");
      const absolute = path.isAbsolute(filePath2) ? filePath2 : path.resolve(process.cwd(), filePath2);
      return {
        url: `file:${absolute.replace(/\\/g, "/")}`,
        remote: false,
        displayPath: absolute
      };
    }
    if (/^(libsql|https?|wss?):\/\//i.test(explicitUrl)) {
      let displayPath = explicitUrl;
      try {
        const parsed = new URL(explicitUrl);
        displayPath = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        displayPath = explicitUrl.replace(/\/\/.*@/, "//");
      }
      return { url: explicitUrl, authToken, remote: true, displayPath };
    }
    throw new Error("DATABASE_URL must start with file:, libsql://, https:// or wss://");
  }
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, DEFAULT_DB_FILENAME);
  return {
    url: `file:${filePath.replace(/\\/g, "/")}`,
    remote: false,
    displayPath: filePath
  };
}
async function ensureColumn(db, table, column, definition) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => String(row.name).toLowerCase() === column.toLowerCase());
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
async function createSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      platform TEXT NOT NULL,
      action TEXT NOT NULL,
      input TEXT NOT NULL,
      status INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      client_ip TEXT,
      user_agent TEXT,
      error TEXT,
      payload_summary TEXT,
      request_id TEXT
    )
  `);
  await ensureColumn(db, "audit_logs", "request_id", "TEXT");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON audit_logs (timestamp DESC)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_logs_platform ON audit_logs (platform)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_logs_action ON audit_logs (action)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_logs_status ON audit_logs (status)");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS media_history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      thumbnail TEXT,
      duration TEXT,
      author TEXT,
      media_type TEXT,
      formats_json TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await ensureColumn(db, "media_history", "author", "TEXT");
  await ensureColumn(db, "media_history", "media_type", "TEXT");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_media_created ON media_history (created_at DESC)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_media_url ON media_history (url)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_media_platform ON media_history (platform)");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS telemetry_counters (
      counter_name TEXT PRIMARY KEY,
      counter_value INTEGER NOT NULL DEFAULT 0
    )
  `);
  const counters = [
    "totalRequests",
    "successfulRequests",
    "failedRequests",
    "totalStreams",
    "totalDownloads"
  ];
  for (const name of counters) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO telemetry_counters (counter_name, counter_value) VALUES (?, 0)",
      args: [name]
    });
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      client_ip TEXT,
      user_agent TEXT,
      revoked INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions (expires_at)");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at TEXT NOT NULL
    )
  `);
}
async function seedDefaults(db) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const defaults = {
    baseUrl: (process.env.PREXZY_API_BASE_URL || "https://prexzyapis.com").replace(/\/+$/, ""),
    announcement: "StreamPulse is online \u2014 fast HD streaming, Terabox cloud playback and MP3 extraction.",
    announcementActive: "true",
    announcementLevel: "info",
    rateLimitEnabled: "false",
    rateLimitRpm: "60",
    maintenanceMode: "false",
    nsfwEnabled: process.env.NSFW_ENABLED === "false" ? "false" : "true",
    searchEnabled: "true",
    downloadsEnabled: "true",
    adminSessionVersion: "1",
    sessionSecret: crypto.randomBytes(48).toString("base64url")
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)",
      args: [key, value, now]
    });
  }
}
async function initDatabase() {
  if (dbClient) return dbClient;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const target = resolveDatabaseTarget();
    databaseInfo = {
      url: target.url,
      remote: target.remote,
      displayPath: target.displayPath
    };
    try {
      if (!target.remote) {
        const filePath = target.displayPath;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }
      const client = createClient({
        url: target.url,
        authToken: target.authToken
      });
      await createSchema(client);
      await seedDefaults(client);
      if (!target.remote) {
        try {
          await client.execute("PRAGMA journal_mode = WAL");
          await client.execute("PRAGMA busy_timeout = 5000");
        } catch {
        }
      }
      dbClient = client;
      console.log(`[db] Connected to ${target.remote ? "remote libSQL" : "local SQLite"} at ${target.displayPath}`);
      return client;
    } catch (error) {
      console.error("[db] Database initialization failed:", error);
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_DB !== "true") {
        throw new Error(
          "Database unavailable. Set DATABASE_URL / DATABASE_AUTH_TOKEN, or ALLOW_MEMORY_DB=true for an ephemeral demo instance."
        );
      }
      console.warn("[db] Falling back to an ephemeral in-memory database. Data will be lost on restart.");
      const memory = createClient({ url: ":memory:" });
      await createSchema(memory);
      await seedDefaults(memory);
      dbClient = memory;
      databaseInfo = {
        url: ":memory:",
        remote: false,
        displayPath: ":memory: (ephemeral)"
      };
      return memory;
    }
  })();
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}
async function getDb() {
  return dbClient ?? initDatabase();
}
function getDatabasePath() {
  if (!databaseInfo.displayPath) {
    try {
      const target = resolveDatabaseTarget();
      return target.displayPath;
    } catch {
      return "unknown";
    }
  }
  return databaseInfo.displayPath;
}
function isRemoteDatabase() {
  return databaseInfo.remote;
}
async function closeDatabase() {
  if (!dbClient) return;
  try {
    dbClient.close();
  } catch {
  }
  dbClient = null;
}
async function getConfigValueSql(key) {
  const db = await getDb();
  try {
    const res = await db.execute({
      sql: "SELECT value FROM system_config WHERE key = ? LIMIT 1",
      args: [key]
    });
    if (res.rows.length === 0) return null;
    return res.rows[0].value === null ? null : String(res.rows[0].value);
  } catch (error) {
    console.error(`[db] Failed reading config "${key}":`, error);
    return null;
  }
}
async function setConfigValueSql(key, value) {
  const db = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.execute({
    sql: `INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, now]
  });
}
async function deleteConfigValueSql(key) {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM system_config WHERE key = ?", args: [key] });
}
async function getSystemConfigSql() {
  const db = await getDb();
  try {
    const result = await db.execute("SELECT key, value FROM system_config");
    const map = /* @__PURE__ */ new Map();
    for (const row of result.rows) {
      map.set(String(row.key), String(row.value));
    }
    const level = map.get("announcementLevel");
    return {
      baseUrl: map.get("baseUrl") || (process.env.PREXZY_API_BASE_URL || "https://prexzyapis.com").replace(/\/+$/, ""),
      announcement: map.get("announcement") || "StreamPulse is online \u2014 fast HD streaming and media extraction ready.",
      announcementActive: map.get("announcementActive") !== "false",
      announcementLevel: level === "success" || level === "warning" || level === "critical" ? level : "info",
      rateLimitEnabled: map.get("rateLimitEnabled") === "true",
      rateLimitRpm: Math.min(600, Math.max(5, Number(map.get("rateLimitRpm")) || 60)),
      maintenanceMode: map.get("maintenanceMode") === "true",
      nsfwEnabled: map.get("nsfwEnabled") !== "false",
      searchEnabled: map.get("searchEnabled") !== "false",
      downloadsEnabled: map.get("downloadsEnabled") !== "false"
    };
  } catch (error) {
    console.error("[db] Error reading system config:", error);
    return {
      baseUrl: (process.env.PREXZY_API_BASE_URL || "https://prexzyapis.com").replace(/\/+$/, ""),
      announcement: "StreamPulse is online \u2014 fast HD streaming and media extraction ready.",
      announcementActive: true,
      announcementLevel: "info",
      rateLimitEnabled: false,
      rateLimitRpm: 60,
      maintenanceMode: false,
      nsfwEnabled: process.env.NSFW_ENABLED !== "false",
      searchEnabled: true,
      downloadsEnabled: true
    };
  }
}
async function updateSystemConfigSql(updates) {
  const entries = [];
  if (updates.baseUrl !== void 0) entries.push(["baseUrl", updates.baseUrl]);
  if (updates.announcement !== void 0) entries.push(["announcement", updates.announcement]);
  if (updates.announcementActive !== void 0) {
    entries.push(["announcementActive", String(updates.announcementActive)]);
  }
  if (updates.announcementLevel !== void 0) {
    entries.push(["announcementLevel", updates.announcementLevel]);
  }
  if (updates.rateLimitEnabled !== void 0) {
    entries.push(["rateLimitEnabled", String(updates.rateLimitEnabled)]);
  }
  if (updates.rateLimitRpm !== void 0) {
    entries.push(["rateLimitRpm", String(updates.rateLimitRpm)]);
  }
  if (updates.maintenanceMode !== void 0) {
    entries.push(["maintenanceMode", String(updates.maintenanceMode)]);
  }
  if (updates.nsfwEnabled !== void 0) {
    entries.push(["nsfwEnabled", String(updates.nsfwEnabled)]);
  }
  if (updates.searchEnabled !== void 0) {
    entries.push(["searchEnabled", String(updates.searchEnabled)]);
  }
  if (updates.downloadsEnabled !== void 0) {
    entries.push(["downloadsEnabled", String(updates.downloadsEnabled)]);
  }
  for (const [key, value] of entries) {
    await setConfigValueSql(key, value);
  }
}
async function getOrCreateSessionSecretSql() {
  const existing = await getConfigValueSql("sessionSecret");
  if (existing && existing.length >= 32) return existing;
  const secret = crypto.randomBytes(48).toString("base64url");
  await setConfigValueSql("sessionSecret", secret);
  return secret;
}
async function getAdminSessionVersionSql() {
  const raw = await getConfigValueSql("adminSessionVersion");
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}
async function createAdminSessionSql(input) {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO admin_sessions (id, created_at, expires_at, last_seen_at, client_ip, user_agent, revoked)
          VALUES (?, ?, ?, ?, ?, ?, 0)`,
    args: [
      input.id,
      input.createdAt,
      input.expiresAt,
      input.createdAt,
      input.clientIp || null,
      input.userAgent || null
    ]
  });
}
async function getAdminSessionSql(id) {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT id, expires_at, last_seen_at, revoked FROM admin_sessions WHERE id = ? LIMIT 1",
    args: [id]
  });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: String(row.id),
    expiresAt: String(row.expires_at),
    lastSeenAt: String(row.last_seen_at),
    revoked: Number(row.revoked) === 1
  };
}
async function touchAdminSessionSql(id, lastSeenAt) {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?",
    args: [lastSeenAt, id]
  });
}
async function revokeAdminSessionSql(id) {
  const db = await getDb();
  await db.execute({ sql: "UPDATE admin_sessions SET revoked = 1 WHERE id = ?", args: [id] });
}
async function revokeAllAdminSessionsSql(exceptId) {
  const db = await getDb();
  if (exceptId) {
    await db.execute({
      sql: "UPDATE admin_sessions SET revoked = 1 WHERE id != ?",
      args: [exceptId]
    });
  } else {
    await db.execute("UPDATE admin_sessions SET revoked = 1");
  }
}
async function listAdminSessionsSql(currentId) {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT id, created_at, expires_at, last_seen_at, client_ip, user_agent
          FROM admin_sessions
          WHERE revoked = 0 AND expires_at > ?
          ORDER BY created_at DESC
          LIMIT 50`,
    args: [(/* @__PURE__ */ new Date()).toISOString()]
  });
  return res.rows.map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    lastSeenAt: String(row.last_seen_at),
    clientIp: row.client_ip ? String(row.client_ip) : void 0,
    userAgent: row.user_agent ? String(row.user_agent) : void 0,
    current: currentId ? String(row.id) === currentId : false
  }));
}
async function countActiveAdminSessionsSql() {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM admin_sessions WHERE revoked = 0 AND expires_at > ?",
    args: [(/* @__PURE__ */ new Date()).toISOString()]
  });
  return Number(res.rows[0]?.total || 0);
}
async function pruneAdminSessionsSql() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
  const res = await db.execute({
    sql: "DELETE FROM admin_sessions WHERE expires_at < ? OR (revoked = 1 AND created_at < ?)",
    args: [(/* @__PURE__ */ new Date()).toISOString(), cutoff]
  });
  return Number(res.rowsAffected || 0);
}
async function listBlockedIpsSql() {
  const db = await getDb();
  const res = await db.execute("SELECT ip, reason, created_at FROM blocked_ips ORDER BY created_at DESC LIMIT 1000");
  return res.rows.map((row) => ({
    ip: String(row.ip),
    reason: row.reason ? String(row.reason) : void 0,
    createdAt: String(row.created_at)
  }));
}
async function addBlockedIpSql(ip, reason) {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO blocked_ips (ip, reason, created_at) VALUES (?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason`,
    args: [ip, reason || null, (/* @__PURE__ */ new Date()).toISOString()]
  });
}
async function removeBlockedIpSql(ip) {
  const db = await getDb();
  const res = await db.execute({ sql: "DELETE FROM blocked_ips WHERE ip = ?", args: [ip] });
  return Number(res.rowsAffected || 0) > 0;
}
async function recordLogSql(entry) {
  const db = await getDb();
  const fullEntry = {
    id: `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  try {
    await db.execute({
      sql: `INSERT INTO audit_logs
            (id, timestamp, platform, action, input, status, latency_ms, client_ip, user_agent, error, payload_summary, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fullEntry.id,
        fullEntry.timestamp,
        fullEntry.platform,
        fullEntry.action,
        fullEntry.input,
        fullEntry.status,
        fullEntry.latencyMs,
        fullEntry.clientIp || null,
        fullEntry.userAgent || null,
        fullEntry.error || null,
        fullEntry.payloadSummary || null,
        fullEntry.requestId || null
      ]
    });
    const isSuccess = fullEntry.status >= 200 && fullEntry.status < 400;
    await db.execute(
      `UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = 'totalRequests'`
    );
    await db.execute({
      sql: "UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?",
      args: [isSuccess ? "successfulRequests" : "failedRequests"]
    });
    if (fullEntry.action === "stream") {
      await db.execute({
        sql: "UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?",
        args: ["totalStreams"]
      });
    } else if (fullEntry.action === "download") {
      await db.execute({
        sql: "UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?",
        args: ["totalDownloads"]
      });
    }
  } catch (error) {
    console.error("[db] Error inserting audit log:", error);
  }
  return fullEntry;
}
async function queryLogsSql(filters) {
  const db = await getDb();
  try {
    const conditions = [];
    const args = [];
    if (filters.platform && filters.platform !== "all") {
      conditions.push("LOWER(platform) = LOWER(?)");
      args.push(filters.platform);
    }
    if (filters.action && filters.action !== "all") {
      conditions.push("LOWER(action) = LOWER(?)");
      args.push(filters.action);
    }
    if (filters.status && filters.status !== "all") {
      if (filters.status === "success") conditions.push("status >= 200 AND status < 400");
      else if (filters.status === "error") conditions.push("status >= 400");
    }
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conditions.push("(input LIKE ? OR error LIKE ? OR payload_summary LIKE ? OR client_ip LIKE ?)");
      args.push(pattern, pattern, pattern, pattern);
    }
    if (filters.from) {
      conditions.push("timestamp >= ?");
      args.push(filters.from);
    }
    if (filters.to) {
      conditions.push("timestamp <= ?");
      args.push(filters.to);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      args
    });
    const total = Number(countRes.rows[0]?.total || 0);
    const limit = Math.min(Math.max(filters.limit || 100, 1), 1e3);
    const offset = Math.max(filters.offset || 0, 0);
    const logsRes = await db.execute({
      sql: `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    });
    const logs = logsRes.rows.map((row) => ({
      id: String(row.id),
      timestamp: String(row.timestamp),
      platform: String(row.platform),
      action: String(row.action),
      input: String(row.input),
      status: Number(row.status),
      latencyMs: Number(row.latency_ms),
      clientIp: row.client_ip ? String(row.client_ip) : void 0,
      userAgent: row.user_agent ? String(row.user_agent) : void 0,
      error: row.error ? String(row.error) : void 0,
      payloadSummary: row.payload_summary ? String(row.payload_summary) : void 0,
      requestId: row.request_id ? String(row.request_id) : void 0
    }));
    return { total, logs };
  } catch (error) {
    console.error("[db] Error querying logs:", error);
    return { total: 0, logs: [] };
  }
}
async function deleteLogSql(id) {
  const db = await getDb();
  const res = await db.execute({ sql: "DELETE FROM audit_logs WHERE id = ?", args: [id] });
  return Number(res.rowsAffected || 0) > 0;
}
async function clearLogsSql() {
  const db = await getDb();
  await db.execute("DELETE FROM audit_logs");
}
async function deleteOldLogsSql(olderThanDays) {
  const db = await getDb();
  const days = Math.min(Math.max(Math.round(olderThanDays), 1), 3650);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
  const res = await db.execute({ sql: "DELETE FROM audit_logs WHERE timestamp < ?", args: [cutoff] });
  return Number(res.rowsAffected || 0);
}
async function getAdminStatsSql() {
  const db = await getDb();
  try {
    const counterRes = await db.execute("SELECT counter_name, counter_value FROM telemetry_counters");
    const counters = /* @__PURE__ */ new Map();
    for (const row of counterRes.rows) {
      counters.set(String(row.counter_name), Number(row.counter_value || 0));
    }
    const platformRes = await db.execute(
      "SELECT platform, COUNT(*) AS count FROM audit_logs GROUP BY platform"
    );
    const platformBreakdown = {
      youtube: 0,
      terabox: 0,
      facebook: 0,
      instagram: 0,
      tiktok: 0,
      pinterest: 0,
      xnxx: 0,
      xvideos: 0,
      aio: 0,
      system: 0
    };
    for (const row of platformRes.rows) {
      platformBreakdown[String(row.platform).toLowerCase()] = Number(row.count || 0);
    }
    const actionRes = await db.execute(
      "SELECT action, COUNT(*) AS count FROM audit_logs GROUP BY action"
    );
    const actionBreakdown = {
      extract: 0,
      stream: 0,
      download: 0,
      search: 0,
      admin: 0
    };
    for (const row of actionRes.rows) {
      actionBreakdown[String(row.action).toLowerCase()] = Number(row.count || 0);
    }
    const latencyRes = await db.execute(`
      SELECT AVG(latency_ms) AS avg_latency FROM (
        SELECT latency_ms FROM audit_logs WHERE latency_ms > 0 ORDER BY timestamp DESC LIMIT 200
      )
    `);
    const averageLatencyMs = Math.round(Number(latencyRes.rows[0]?.avg_latency || 0));
    const errRes = await db.execute("SELECT COUNT(*) AS total FROM audit_logs WHERE status >= 400");
    const recentErrorsCount = Number(errRes.rows[0]?.total || 0);
    const uniqueRes = await db.execute(
      "SELECT COUNT(DISTINCT client_ip) AS total FROM audit_logs WHERE client_ip IS NOT NULL"
    );
    const uniqueClients = Number(uniqueRes.rows[0]?.total || 0);
    const last24hCutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
    const last24hRes = await db.execute({
      sql: "SELECT COUNT(*) AS total FROM audit_logs WHERE timestamp >= ?",
      args: [last24hCutoff]
    });
    const requestsLast24h = Number(last24hRes.rows[0]?.total || 0);
    const totalRequests = counters.get("totalRequests") || 0;
    const failedRequests = counters.get("failedRequests") || 0;
    return {
      totalRequests,
      successfulRequests: counters.get("successfulRequests") || 0,
      failedRequests,
      totalStreams: counters.get("totalStreams") || 0,
      totalDownloads: counters.get("totalDownloads") || 0,
      averageLatencyMs,
      platformBreakdown,
      actionBreakdown,
      recentErrorsCount,
      uniqueClients,
      requestsLast24h,
      errorRate: totalRequests > 0 ? Math.round(failedRequests / totalRequests * 1e3) / 10 : 0
    };
  } catch (error) {
    console.error("[db] Error reading admin stats:", error);
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalStreams: 0,
      totalDownloads: 0,
      averageLatencyMs: 0,
      platformBreakdown: {},
      actionBreakdown: {},
      recentErrorsCount: 0,
      uniqueClients: 0,
      requestsLast24h: 0,
      errorRate: 0
    };
  }
}
async function resetStatsSql() {
  const db = await getDb();
  await db.execute("UPDATE telemetry_counters SET counter_value = 0");
}
async function saveMediaHistorySql(media) {
  const db = await getDb();
  try {
    const id = `media_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    await db.execute({
      sql: `INSERT OR REPLACE INTO media_history
            (id, url, platform, title, thumbnail, duration, author, media_type, formats_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        media.sourceUrl,
        media.platform,
        media.title,
        media.thumbnail || null,
        media.duration || null,
        media.author || null,
        media.mediaType || null,
        JSON.stringify(media.downloads || []),
        (/* @__PURE__ */ new Date()).toISOString()
      ]
    });
  } catch (error) {
    console.warn("[db] Could not save media history:", error);
  }
}
function mapMediaRow(row) {
  let downloads = [];
  try {
    downloads = row.formats_json ? JSON.parse(String(row.formats_json)) : [];
  } catch {
    downloads = [];
  }
  return {
    id: String(row.id),
    url: String(row.url),
    platform: String(row.platform),
    title: String(row.title),
    thumbnail: row.thumbnail ? String(row.thumbnail) : void 0,
    duration: row.duration ? String(row.duration) : void 0,
    author: row.author ? String(row.author) : void 0,
    mediaType: row.media_type ? String(row.media_type) : void 0,
    downloads,
    createdAt: String(row.created_at)
  };
}
async function getPublicMediaHistorySql(limit = 8, includeNsfw = true) {
  const db = await getDb();
  try {
    const nsfwClause = includeNsfw ? "" : "AND platform NOT IN ('xnxx','xvideos')";
    const res = await db.execute({
      sql: `SELECT id, platform, title, thumbnail, duration, author, media_type, created_at, '[]' AS formats_json
            FROM media_history
            WHERE title IS NOT NULL ${nsfwClause}
            ORDER BY created_at DESC LIMIT ?`,
      args: [Math.min(Math.max(limit, 1), 24)]
    });
    return res.rows.map((row) => ({
      ...mapMediaRow(row),
      url: ""
    }));
  } catch (error) {
    console.error("[db] Error reading public media history:", error);
    return [];
  }
}
async function queryMediaHistorySql(filters) {
  const db = await getDb();
  try {
    const conditions = [];
    const args = [];
    if (filters.platform && filters.platform !== "all") {
      conditions.push("LOWER(platform) = LOWER(?)");
      args.push(filters.platform);
    }
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conditions.push("(title LIKE ? OR url LIKE ? OR author LIKE ?)");
      args.push(pattern, pattern, pattern);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM media_history ${where}`,
      args
    });
    const total = Number(countRes.rows[0]?.total || 0);
    const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
    const offset = Math.max(filters.offset || 0, 0);
    const res = await db.execute({
      sql: `SELECT * FROM media_history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    });
    return { total, items: res.rows.map(mapMediaRow) };
  } catch (error) {
    console.error("[db] Error querying media history:", error);
    return { total: 0, items: [] };
  }
}
async function deleteMediaHistorySql(id) {
  const db = await getDb();
  const res = await db.execute({ sql: "DELETE FROM media_history WHERE id = ?", args: [id] });
  return Number(res.rowsAffected || 0) > 0;
}
async function clearMediaHistorySql() {
  const db = await getDb();
  await db.execute("DELETE FROM media_history");
}
async function queryNamedCounts(db, sql, args, limit) {
  const res = await db.execute({ sql, args });
  return res.rows.slice(0, limit).map((row) => ({
    name: String(row.name ?? "unknown"),
    count: Number(row.count || 0)
  }));
}
async function getAnalyticsSeriesSql(hours = 24) {
  const db = await getDb();
  const safeHours = Math.min(Math.max(Math.round(hours), 1), 720);
  const start = new Date(Date.now() - safeHours * 60 * 60 * 1e3);
  start.setMinutes(0, 0, 0);
  const res = await db.execute({
    sql: `SELECT substr(timestamp, 1, 13) AS bucket,
                 COUNT(*) AS requests,
                 SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
          FROM audit_logs
          WHERE timestamp >= ?
          GROUP BY bucket
          ORDER BY bucket ASC`,
    args: [start.toISOString()]
  });
  const byBucket = /* @__PURE__ */ new Map();
  for (const row of res.rows) {
    byBucket.set(String(row.bucket), {
      requests: Number(row.requests || 0),
      errors: Number(row.errors || 0)
    });
  }
  const points = [];
  for (let i = 0; i <= safeHours; i += 1) {
    const pointDate = new Date(start.getTime() + i * 60 * 60 * 1e3);
    const bucket = pointDate.toISOString().slice(0, 13);
    const value = byBucket.get(bucket);
    points.push({
      label: pointDate.toISOString(),
      requests: value?.requests || 0,
      errors: value?.errors || 0
    });
  }
  return points;
}
async function getTopAnalyticsSql() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
  const [topPlatforms, topActions, topInputs, topClients, mediaSummary] = await Promise.all([
    queryNamedCounts(
      db,
      `SELECT platform AS name, COUNT(*) AS count FROM audit_logs
       WHERE timestamp >= ? GROUP BY platform ORDER BY count DESC LIMIT 8`,
      [cutoff],
      8
    ),
    queryNamedCounts(
      db,
      `SELECT action AS name, COUNT(*) AS count FROM audit_logs
       WHERE timestamp >= ? GROUP BY action ORDER BY count DESC LIMIT 8`,
      [cutoff],
      8
    ),
    queryNamedCounts(
      db,
      `SELECT input AS name, COUNT(*) AS count FROM audit_logs
       WHERE timestamp >= ? AND action != 'admin' GROUP BY input ORDER BY count DESC LIMIT 10`,
      [cutoff],
      10
    ),
    queryNamedCounts(
      db,
      `SELECT COALESCE(client_ip, 'unknown') AS name, COUNT(*) AS count FROM audit_logs
       WHERE timestamp >= ? GROUP BY client_ip ORDER BY count DESC LIMIT 10`,
      [cutoff],
      10
    ),
    queryNamedCounts(
      db,
      `SELECT platform AS name, COUNT(*) AS count FROM media_history
       WHERE created_at >= ? GROUP BY platform ORDER BY count DESC LIMIT 8`,
      [cutoff],
      8
    )
  ]);
  return { topPlatforms, topActions, topInputs, topClients, mediaSummary };
}
async function getDatabaseDiagnostics() {
  try {
    const db = await getDb();
    const [logsRes, mediaRes] = await Promise.all([
      db.execute("SELECT COUNT(*) AS c FROM audit_logs"),
      db.execute("SELECT COUNT(*) AS c FROM media_history")
    ]);
    let size = 0;
    if (!databaseInfo.remote && databaseInfo.displayPath && fs.existsSync(databaseInfo.displayPath)) {
      size = fs.statSync(databaseInfo.displayPath).size;
    }
    return {
      connected: true,
      type: databaseInfo.remote ? "libSQL (Turso)" : "SQLite (libSQL driver)",
      path: databaseInfo.displayPath || getDatabasePath(),
      fileSizeBytes: size,
      totalLogs: Number(logsRes.rows[0]?.c || 0),
      totalMediaHistory: Number(mediaRes.rows[0]?.c || 0),
      remote: databaseInfo.remote
    };
  } catch {
    return {
      connected: false,
      type: databaseInfo.remote ? "libSQL (Turso)" : "SQLite (libSQL driver)",
      path: getDatabasePath(),
      fileSizeBytes: 0,
      totalLogs: 0,
      totalMediaHistory: 0,
      remote: databaseInfo.remote
    };
  }
}
async function exportDatabaseSnapshotSql() {
  const db = await getDb();
  const [config, logs, media, counters, blocked] = await Promise.all([
    db.execute("SELECT key, value, updated_at FROM system_config"),
    db.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000"),
    db.execute("SELECT * FROM media_history ORDER BY created_at DESC LIMIT 2000"),
    db.execute("SELECT * FROM telemetry_counters"),
    db.execute("SELECT * FROM blocked_ips")
  ]);
  const secretKeys = /* @__PURE__ */ new Set(["sessionSecret", "adminPasswordHash", "adminPassword"]);
  return {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    version: 1,
    config: config.rows.filter((row) => !secretKeys.has(String(row.key))).map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at })),
    counters: counters.rows.map((row) => ({
      name: row.counter_name,
      value: row.counter_value
    })),
    logs: logs.rows,
    media: media.rows,
    blockedIps: blocked.rows
  };
}

// src/server/authCrypto.ts
import crypto2 from "node:crypto";
var MIN_PASSWORD_LENGTH = 10;
var SCRYPT_KEYLEN = 64;
var SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${derived.toString("hex")}`;
}
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  if (!storedHash.startsWith("scrypt$")) {
    return timingSafeEqualString(password, storedHash);
  }
  const parts = storedHash.split("$");
  if (parts.length !== 6) return false;
  const [, nRaw, rRaw, pRaw, salt, expectedHex] = parts;
  const params = {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 64 * 1024 * 1024
  };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const derived = crypto2.scryptSync(password, salt, expected.length, params);
    return expected.length === derived.length && crypto2.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto2.timingSafeEqual(left, left);
    return false;
  }
  return crypto2.timingSafeEqual(left, right);
}
function randomToken(bytes = 32) {
  return crypto2.randomBytes(bytes).toString("base64url");
}
function sign(data, secret) {
  return crypto2.createHmac("sha256", secret).update(data).digest("base64url");
}
function createSessionToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}
function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [body, signature] = segments;
  const expected = sign(body, secret);
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed?.sub !== "admin" || typeof parsed.sid !== "string") return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Math.floor(Date.now() / 1e3)) return null;
    if (!Number.isFinite(parsed.ver)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function generateReadablePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto2.randomBytes(24);
  let result = "";
  for (const byte of bytes) {
    result += alphabet[byte % alphabet.length];
  }
  return result;
}

// src/server/auth.ts
var MAX_LOGIN_ATTEMPTS = 5;
var LOGIN_WINDOW_MS = 15 * 60 * 1e3;
var AdminAuthService = class {
  constructor() {
    this.passwordHash = "";
    this.sessionSecret = "";
    this.sessionVersion = 1;
    this.sessionTtlHours = 12;
    this.initPromise = null;
    this.initialized = false;
    this.generatedPassword = null;
    this.loginAttempts = /* @__PURE__ */ new Map();
  }
  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const ttl = Number(process.env.ADMIN_SESSION_HOURS);
      this.sessionTtlHours = Number.isFinite(ttl) ? Math.min(Math.max(ttl, 1), 168) : 12;
      const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
      const forceReset = process.env.ADMIN_PASSWORD_RESET === "true";
      const storedHash = await getConfigValueSql("adminPasswordHash");
      const legacyPassword = await getConfigValueSql("adminPassword");
      if (forceReset && envPassword) {
        await this.persistPassword(envPassword);
        console.warn("[auth] ADMIN_PASSWORD_RESET=true \u2014 admin password re-seeded from ADMIN_PASSWORD.");
      } else if (!storedHash && envPassword) {
        await this.persistPassword(envPassword);
      } else if (!storedHash && legacyPassword) {
        await this.persistPassword(legacyPassword);
        await deleteConfigValueSql("adminPassword");
        console.warn("[auth] Migrated the legacy plaintext admin password to a scrypt hash.");
      } else if (!storedHash) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "ADMIN_PASSWORD is required on first production boot. Set it (12+ chars), then restart. To rotate it later, set ADMIN_PASSWORD_RESET=true for one boot."
          );
        }
        this.generatedPassword = generateReadablePassword();
        await this.persistPassword(this.generatedPassword);
        console.warn("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        console.warn("[auth] No ADMIN_PASSWORD set. Generated a development password:");
        console.warn(`[auth] ${this.generatedPassword}`);
        console.warn("[auth] Set ADMIN_PASSWORD in .env to choose your own.");
        console.warn("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
      } else {
        this.passwordHash = storedHash;
        if (legacyPassword) await deleteConfigValueSql("adminPassword");
      }
      const envSecret = (process.env.ADMIN_SESSION_SECRET || "").trim();
      this.sessionSecret = envSecret.length >= 32 ? envSecret : await getOrCreateSessionSecretSql();
      this.sessionVersion = await getAdminSessionVersionSql();
      this.initialized = true;
    })();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
  get sessionTtl() {
    return this.sessionTtlHours;
  }
  get generatedDevPassword() {
    return this.generatedPassword;
  }
  async login(password, clientIp, userAgent) {
    await this.initialize();
    const now = Date.now();
    const attempt = this.loginAttempts.get(clientIp);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      const waitSec = Math.ceil((attempt.lockedUntil - now) / 1e3);
      throw new AuthError(
        `Too many failed attempts. Try again in ${Math.ceil(waitSec / 60)} minute(s).`,
        429
      );
    }
    if (!password || !verifyPassword(password, this.passwordHash)) {
      this.registerFailure(clientIp);
      throw new AuthError("Invalid admin password.", 401);
    }
    this.loginAttempts.delete(clientIp);
    await this.maybeUpgradeLegacyHash(password);
    const sid = randomToken(18);
    const createdAt = /* @__PURE__ */ new Date();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlHours * 60 * 60 * 1e3);
    const token = createSessionToken(
      {
        sub: "admin",
        sid,
        ver: this.sessionVersion,
        iat: Math.floor(createdAt.getTime() / 1e3),
        exp: Math.floor(expiresAt.getTime() / 1e3)
      },
      this.sessionSecret
    );
    await createAdminSessionSql({
      id: sid,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      clientIp,
      userAgent
    });
    return { token, expiresAt: expiresAt.toISOString(), sid };
  }
  async authenticate(token) {
    await this.initialize();
    if (!token) return null;
    const payload = verifySessionToken(token, this.sessionSecret);
    if (!payload) return null;
    if (payload.ver !== this.sessionVersion) return null;
    const session = await getAdminSessionSql(payload.sid);
    if (!session || session.revoked) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    const lastSeen = new Date(session.lastSeenAt).getTime();
    if (Date.now() - lastSeen > 5 * 60 * 1e3) {
      await touchAdminSessionSql(payload.sid, (/* @__PURE__ */ new Date()).toISOString()).catch(() => {
      });
    }
    return { sid: payload.sid, expiresAt: session.expiresAt };
  }
  async logout(token) {
    await this.initialize();
    const payload = verifySessionToken(token, this.sessionSecret);
    if (payload) {
      await revokeAdminSessionSql(payload.sid).catch(() => {
      });
    }
  }
  async changePassword(currentPassword, newPassword, currentSid) {
    await this.initialize();
    if (!verifyPassword(currentPassword, this.passwordHash)) {
      throw new AuthError("Current password is incorrect.", 400);
    }
    const trimmed = (newPassword || "").trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    }
    if (trimmed === currentPassword) {
      throw new AuthError("New password must be different from the current password.", 400);
    }
    await this.persistPassword(trimmed);
    await revokeAllAdminSessionsSql(currentSid);
  }
  async listSessions(currentSid) {
    await this.initialize();
    return listAdminSessionsSql(currentSid);
  }
  async revokeOtherSessions(currentSid) {
    await this.initialize();
    await revokeAllAdminSessionsSql(currentSid);
  }
  async revokeSession(sid, currentSid) {
    await this.initialize();
    if (sid === currentSid) {
      throw new AuthError("Use logout to end the current session.", 400);
    }
    await revokeAdminSessionSql(sid);
    return true;
  }
  async activeSessionCount() {
    await this.initialize();
    return countActiveAdminSessionsSql();
  }
  verifyCurrentPassword(password) {
    return verifyPassword(password, this.passwordHash);
  }
  registerFailure(ip) {
    const now = Date.now();
    const existing = this.loginAttempts.get(ip);
    if (!existing || now - existing.firstFailureAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(ip, {
        failures: 1,
        firstFailureAt: now,
        lockedUntil: 0
      });
      return;
    }
    existing.failures += 1;
    if (existing.failures >= MAX_LOGIN_ATTEMPTS) {
      existing.lockedUntil = now + LOGIN_WINDOW_MS;
    }
  }
  async persistPassword(password) {
    this.passwordHash = hashPassword(password);
    await setConfigValueSql("adminPasswordHash", this.passwordHash);
  }
  async maybeUpgradeLegacyHash(password) {
    if (!this.passwordHash.startsWith("scrypt$")) {
      await this.persistPassword(password);
    }
  }
};
var AuthError = class extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
};
var adminAuth = new AdminAuthService();

// src/server/security.ts
import dns from "node:dns/promises";
import net from "node:net";
var PRIVATE_IPV4 = new net.BlockList();
var BLOCKED_V4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
];
for (const [address, prefix] of BLOCKED_V4_CIDRS) {
  PRIVATE_IPV4.addSubnet(address, prefix, "ipv4");
}
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "host.docker.internal",
  "gateway.docker.internal"
]);
var urlSafetyCache = /* @__PURE__ */ new Map();
var DNS_CACHE_MS = 5 * 60 * 1e3;
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}
function isPrivateIp(rawIp) {
  const ip = rawIp.trim().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip) return true;
  const version = net.isIP(ip);
  if (version === 4) {
    return PRIVATE_IPV4.check(ip, "ipv4");
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith("ff")) return true;
    if (lower.startsWith("2001:db8")) return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateIp(lower.slice("::ffff:".length));
    }
    return false;
  }
  return true;
}
async function assertSafeHttpUrl(rawUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs containing credentials are not allowed");
  }
  const allowPrivate = options.allowPrivate ?? process.env.ALLOW_PRIVATE_PROXY === "true";
  if (allowPrivate) return parsed;
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private or internal hostnames are not allowed");
  }
  const cached = urlSafetyCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.safe) throw new Error("Destination resolves to a private network");
    return parsed;
  }
  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error(`Could not resolve host: ${hostname}`);
    }
  }
  if (addresses.length === 0) {
    throw new Error(`Could not resolve host: ${hostname}`);
  }
  const blocked = addresses.find((entry) => isPrivateIp(entry.address));
  urlSafetyCache.set(hostname, {
    safe: !blocked,
    expiresAt: Date.now() + DNS_CACHE_MS
  });
  if (blocked) {
    throw new Error("Destination resolves to a private network");
  }
  return parsed;
}
async function safeFetch(rawUrl, init = {}, options = {}) {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = (await assertSafeHttpUrl(rawUrl, options)).toString();
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const upstream = await fetch(currentUrl, {
      ...init,
      method,
      body,
      redirect: "manual"
    });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) {
      return upstream;
    }
    const location = upstream.headers.get("location");
    if (!location) return upstream;
    if (redirects === maxRedirects) {
      throw new Error("Too many upstream redirects");
    }
    const nextUrl = new URL(location, currentUrl);
    await assertSafeHttpUrl(nextUrl.toString(), options);
    currentUrl = nextUrl.toString();
    if ([301, 302, 303].includes(upstream.status) && method !== "GET" && method !== "HEAD") {
      method = "GET";
      body = void 0;
    }
  }
  throw new Error("Too many upstream redirects");
}
function sanitizeFilename(filename, fallback = "download") {
  const cleaned = filename.replace(/[/\\?%*:|"<>]/g, "_").replace(/[\r\n\t]/g, " ").trim().slice(0, 180);
  return cleaned || fallback;
}
function buildContentDisposition(filename, type = "attachment") {
  const safe = sanitizeFilename(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
function securityHeaders() {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}
var SlidingWindowRateLimiter = class {
  constructor(windowMs = 6e4) {
    this.windowMs = windowMs;
    this.buckets = /* @__PURE__ */ new Map();
    this.lastCleanup = Date.now();
  }
  check(key, limit) {
    const now = Date.now();
    this.maybeCleanup(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      this.buckets.set(key, bucket);
    }
    bucket.hits = bucket.hits.filter((ts) => now - ts < this.windowMs);
    const allowed = bucket.hits.length < limit;
    if (allowed) bucket.hits.push(now);
    const oldest = bucket.hits[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1e3));
    return {
      allowed,
      remaining: Math.max(0, limit - bucket.hits.length),
      retryAfterSec
    };
  }
  reset(key) {
    this.buckets.delete(key);
  }
  get size() {
    return this.buckets.size;
  }
  maybeCleanup(now) {
    if (now - this.lastCleanup < 6e4 && this.buckets.size < 1e4) return;
    this.lastCleanup = now;
    for (const [key, bucket] of this.buckets) {
      const hits = bucket.hits.filter((ts) => now - ts < this.windowMs);
      if (hits.length === 0) this.buckets.delete(key);
      else bucket.hits = hits;
    }
  }
};
var publicLimiter = new SlidingWindowRateLimiter(6e4);
function publicRateLimit(getState) {
  return (req, res, next) => {
    const state = getState();
    if (!state.enabled) {
      next();
      return;
    }
    const ip = getClientIp(req);
    const result = publicLimiter.check(ip, Math.max(1, state.rpm));
    res.setHeader("RateLimit-Limit", String(state.rpm));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      res.status(429).json({
        error: "Too many requests. Please slow down and try again shortly.",
        retryAfterSeconds: result.retryAfterSec
      });
      return;
    }
    next();
  };
}
function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var APP_NAME = "StreamPulse";
var APP_VERSION = process.env.APP_VERSION || "1.1.0";
var PORT = Number(process.env.PORT) || 3e3;
var HOST = process.env.HOST || "0.0.0.0";
var IS_PRODUCTION = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
var IS_VERCEL = process.env.VERCEL === "1";
var STARTED_AT = (/* @__PURE__ */ new Date()).toISOString();
var MAX_MEMORY_LOGS = 500;
var NSFW_PLATFORMS = /* @__PURE__ */ new Set(["xnxx", "xvideos"]);
var ALLOW_PRIVATE_PROXY = process.env.ALLOW_PRIVATE_PROXY === "true";
var app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
app.disable("x-powered-by");
var systemConfig = {
  baseUrl: (process.env.PREXZY_API_BASE_URL || "https://prexzyapis.com").replace(/\/+$/, ""),
  announcement: "StreamPulse is online \u2014 fast HD streaming, Terabox cloud playback and MP3 extraction.",
  announcementActive: true,
  announcementLevel: "info",
  rateLimitEnabled: false,
  rateLimitRpm: 60,
  maintenanceMode: false,
  nsfwEnabled: process.env.NSFW_ENABLED !== "false",
  searchEnabled: true,
  downloadsEnabled: true
};
var auditLogs = [];
var blockedIps = /* @__PURE__ */ new Set();
var initialized = false;
var bootstrapPromise = null;
var httpServer = null;
var memoryStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalStreams: 0,
  totalDownloads: 0,
  averageLatencyMs: 0,
  platformBreakdown: {},
  actionBreakdown: {},
  recentErrorsCount: 0
};
var latencySamples = [];
var nsfwThumbCache = /* @__PURE__ */ new Map();
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor(seconds % 86400 / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function parseLimit(value, fallback, max = 1e3) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? clamp(parsed, 1, max) : fallback;
}
function getRequestId(req) {
  return req.requestId || "unknown";
}
function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}
function sendError(req, res, status, message, code) {
  res.status(status).json({
    error: message,
    code: code || void 0,
    requestId: getRequestId(req)
  });
}
function recordLog(entry) {
  const fullEntry = {
    id: `mem_${Date.now()}_${auditLogs.length}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  auditLogs.unshift(fullEntry);
  if (auditLogs.length > MAX_MEMORY_LOGS) auditLogs.length = MAX_MEMORY_LOGS;
  memoryStats.totalRequests += 1;
  if (entry.status >= 200 && entry.status < 400) memoryStats.successfulRequests += 1;
  else {
    memoryStats.failedRequests += 1;
    memoryStats.recentErrorsCount += 1;
  }
  if (entry.platform) {
    memoryStats.platformBreakdown[entry.platform] = (memoryStats.platformBreakdown[entry.platform] || 0) + 1;
  }
  if (entry.action) {
    memoryStats.actionBreakdown[entry.action] = (memoryStats.actionBreakdown[entry.action] || 0) + 1;
  }
  if (entry.latencyMs > 0) {
    latencySamples.push(entry.latencyMs);
    if (latencySamples.length > 50) latencySamples.shift();
    memoryStats.averageLatencyMs = Math.round(
      latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length
    );
  }
  void recordLogSql({
    ...entry,
    input: String(entry.input || "").slice(0, 600),
    userAgent: entry.userAgent ? String(entry.userAgent).slice(0, 400) : void 0,
    error: entry.error ? String(entry.error).slice(0, 800) : void 0,
    payloadSummary: entry.payloadSummary ? String(entry.payloadSummary).slice(0, 300) : void 0,
    requestId: entry.requestId
  }).catch(() => {
  });
}
function logPublicRequest(req, entry) {
  recordLog({
    ...entry,
    clientIp: getClientIp(req),
    userAgent: String(req.headers["user-agent"] || "Unknown"),
    requestId: getRequestId(req)
  });
}
async function initializeApp() {
  if (initialized) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    await initDatabase();
    const savedConfig = await getSystemConfigSql();
    Object.assign(systemConfig, savedConfig);
    await adminAuth.initialize();
    const blocked = await listBlockedIpsSql();
    blockedIps.clear();
    for (const item of blocked) blockedIps.add(item.ip);
    await pruneAdminSessionsSql().catch(() => {
    });
    initialized = true;
    console.log(`[boot] ${APP_NAME} v${APP_VERSION} initialized`);
    console.log(`[boot] Upstream gateway: ${systemConfig.baseUrl}`);
    console.log(`[boot] Database: ${getDatabasePath()}`);
  })();
  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}
async function buildDiagnostics() {
  const memory = process.memoryUsage();
  const dbDiag = await getDatabaseDiagnostics();
  const activeSessions = await countActiveAdminSessionsSql().catch(() => 0);
  const uptimeSeconds = Math.floor(process.uptime());
  return {
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    memoryUsageMB: Math.round(memory.rss / 1024 / 1024),
    heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || "development",
    version: APP_VERSION,
    pid: process.pid,
    startedAt: STARTED_AT,
    activeSessions,
    cachedLogsCount: Math.max(auditLogs.length, dbDiag.totalLogs),
    database: dbDiag
  };
}
function getRuntimeInfo() {
  return {
    environment: process.env.NODE_ENV || "development",
    version: APP_VERSION,
    nodeVersion: process.version,
    remoteDatabase: isRemoteDatabase(),
    adminPasswordConfigured: true,
    sessionTtlHours: adminAuth.sessionTtl,
    publicUrl: process.env.PUBLIC_URL || process.env.APP_URL || ""
  };
}
function publicConfig() {
  return {
    appName: APP_NAME,
    version: APP_VERSION,
    maintenanceMode: systemConfig.maintenanceMode,
    announcementActive: systemConfig.announcementActive,
    announcement: systemConfig.announcement,
    announcementLevel: systemConfig.announcementLevel,
    nsfwEnabled: systemConfig.nsfwEnabled,
    searchEnabled: systemConfig.searchEnabled,
    downloadsEnabled: systemConfig.downloadsEnabled,
    rateLimitEnabled: systemConfig.rateLimitEnabled,
    rateLimitRpm: systemConfig.rateLimitRpm
  };
}
function validateConfiguredBaseUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Base URL is required");
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Base URL must be a valid absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must use http:// or https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Base URL must not contain credentials");
  }
  return parsed.toString().replace(/\/+$/, "");
}
function isNsfwRequest(platform, sourceUrl) {
  if (NSFW_PLATFORMS.has(platform)) return true;
  const detected = detectPlatform(sourceUrl);
  return NSFW_PLATFORMS.has(detected);
}
function getHealthEndpoints() {
  const base = systemConfig.baseUrl;
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  return [
    { name: "AIO Downloader (aiov2)", url: `${base}/download/aiov2?url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`, method: "GET", nsfw: false },
    { name: "YouTube Info (ytinfo)", url: `${base}/download/ytinfo?url=${encodeURIComponent(youtubeUrl)}`, method: "GET", nsfw: false },
    { name: "YouTube Video (ytmp4)", url: `${base}/download/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, method: "GET", nsfw: false },
    { name: "YouTube Audio (ytmp3)", url: `${base}/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, method: "GET", nsfw: false },
    { name: "YouTube Transcript", url: `${base}/tools/youtube-transcript?url=${encodeURIComponent(youtubeUrl)}`, method: "GET", nsfw: false },
    { name: "Facebook Video (facebookv2)", url: `${base}/download/facebookv2`, method: "POST", body: { url: "https://www.facebook.com/reel/1234" }, nsfw: false },
    { name: "Terabox (terabox)", url: `${base}/download/terabox?url=${encodeURIComponent("https://www.1024tera.com/s/1pLY_llmDlklU2tYse8gEig")}`, method: "GET", nsfw: false },
    { name: "TikTok (tiktokv2)", url: `${base}/download/tiktokv2?url=${encodeURIComponent("https://www.tiktok.com/@sample/video/1")}`, method: "GET", nsfw: false },
    { name: "Instagram (instagram)", url: `${base}/download/instagram?url=${encodeURIComponent("https://www.instagram.com/p/sample")}`, method: "GET", nsfw: false },
    { name: "Pinterest (pinterestV2)", url: `${base}/download/pinterestV2?url=${encodeURIComponent("https://www.pinterest.com/pin/123")}`, method: "GET", nsfw: false },
    { name: "XNXX Download", url: `${base}/nsfw/xnxx-dl?url=${encodeURIComponent("https://www.xnxx.com/video-1/sample")}`, method: "GET", nsfw: true },
    { name: "Xvideos Download", url: `${base}/nsfw/xvideos-dl?url=${encodeURIComponent("https://www.xvideos.com/video.1/sample")}`, method: "GET", nsfw: true },
    { name: "Search YouTube", url: `${base}/search/youtube?q=music`, method: "GET", nsfw: false },
    { name: "Search Pinterest", url: `${base}/search/pinterest?q=art`, method: "GET", nsfw: false },
    { name: "Search XNXX", url: `${base}/nsfw/xnxx-search?query=dance`, method: "GET", nsfw: true },
    { name: "Search Xvideos", url: `${base}/nsfw/xvideos-search?query=dance`, method: "GET", nsfw: true }
  ];
}
async function readResponseSample(response, maxBytes = 900) {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", truncated: false, bytes: 0 };
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let truncated = false;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - bytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
      if (value.byteLength > remaining) {
        truncated = true;
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {
    });
  }
  text += decoder.decode();
  return { text, truncated, bytes };
}
async function resolveNsfwThumbnail(videoUrl) {
  if (!systemConfig.nsfwEnabled || !videoUrl) return "";
  const cached = nsfwThumbCache.get(videoUrl);
  if (cached) return cached;
  try {
    const response = await safeFetch(videoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html"
      },
      signal: AbortSignal.timeout(4e3)
    });
    if (!response.ok) return "";
    const sample = await readResponseSample(response, 64 * 1024);
    const match = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(sample.text) || /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i.exec(sample.text);
    if (match?.[1]) {
      if (nsfwThumbCache.size > 500) {
        const first = nsfwThumbCache.keys().next().value;
        if (first) nsfwThumbCache.delete(first);
      }
      nsfwThumbCache.set(videoUrl, match[1]);
      return match[1];
    }
  } catch {
  }
  return "";
}
function normalizeSearchResults(type, rawList) {
  return rawList.slice(0, 60).map((raw, index) => {
    if (typeof raw === "string") {
      return {
        id: `${type}_${index}`,
        type,
        title: type === "pinterest" ? "Pinterest pin" : "Media result",
        imageUrl: raw,
        thumbnail: raw,
        link: raw,
        url: raw
      };
    }
    const item = raw || {};
    const link = String(
      item.link || item.url || item.webpage_url || item.webpageUrl || item.video_url || item.videoUrl || ""
    ).trim();
    let imageUrl = String(
      item.imageUrl || item.thumbnail || item.thumb || item.image || item.cover || item.origin_cover || ""
    ).trim();
    if (!imageUrl && type === "youtube" && link) {
      const videoId = /(?:v=|youtu\.be\/|shorts\/)([\w-]{6,})/.exec(link)?.[1];
      if (videoId) imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    const author = item.channel || item.channelName || item.author?.name || item.author?.nickname || item.uploader?.name || (typeof item.uploader === "string" ? item.uploader : "") || "";
    const duration = typeof item.duration === "string" ? item.duration : typeof item.duration === "number" ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, "0")}` : item.timestamp || "";
    return {
      ...item,
      id: String(item.id || `${type}_${index}`),
      type,
      title: String(item.title || item.name || item.caption || "Untitled media"),
      channel: author || void 0,
      uploader: author || void 0,
      duration: duration || void 0,
      imageUrl,
      thumbnail: imageUrl,
      link: link || imageUrl,
      url: link || imageUrl
    };
  });
}
function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
app.use(securityHeaders());
app.use((req, res, next) => {
  const requestId = String(req.headers["x-request-id"] || "") || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = requestId.slice(0, 80);
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
var corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
if (corsOrigins.length > 0) {
  app.use("/api", (req, res, next) => {
    const origin = String(req.headers.origin || "");
    if (origin && (corsOrigins.includes("*") || corsOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range, X-Request-Id");
      res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, RateLimit-Remaining");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/api/health") {
    next();
    return;
  }
  const ip = getClientIp(req);
  if (blockedIps.has(ip)) {
    sendError(req, res, 403, "Your IP has been blocked by the administrator.", "IP_BLOCKED");
    return;
  }
  next();
});
app.use("/api", async (req, res, next) => {
  try {
    await initializeApp();
    next();
  } catch (error) {
    next(error);
  }
});
var apiLimiter = publicRateLimit(() => ({
  enabled: systemConfig.rateLimitEnabled,
  rpm: systemConfig.rateLimitRpm
}));
function maintenanceGate(req, res, next) {
  if (systemConfig.maintenanceMode) {
    sendError(
      req,
      res,
      503,
      "StreamPulse is undergoing scheduled maintenance. Please try again shortly.",
      "MAINTENANCE"
    );
    return;
  }
  next();
}
function searchGate(req, res, next) {
  if (!systemConfig.searchEnabled) {
    sendError(req, res, 403, "Search is temporarily disabled by the administrator.", "SEARCH_DISABLED");
    return;
  }
  next();
}
function downloadsGate(req, res, next) {
  if (!systemConfig.downloadsEnabled) {
    sendError(req, res, 403, "Downloads are temporarily disabled by the administrator.", "DOWNLOADS_DISABLED");
    return;
  }
  next();
}
function nsfwGateFor(platform, sourceUrl) {
  if (!systemConfig.nsfwEnabled && isNsfwRequest(platform, sourceUrl)) return false;
  return true;
}
function requireAdmin(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    sendError(req, res, 401, "Unauthorized: admin authentication required.", "UNAUTHORIZED");
    return;
  }
  adminAuth.authenticate(token).then((session) => {
    if (!session) {
      sendError(req, res, 401, "Session expired or invalid. Please sign in again.", "SESSION_EXPIRED");
      return;
    }
    req.admin = session;
    req.adminToken = token;
    next();
  }).catch(next);
}
app.get(["/health", "/api/health"], async (req, res) => {
  try {
    await initializeApp();
    const db = await getDatabaseDiagnostics();
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? "ok" : "degraded",
      service: `${APP_NAME} Media Gateway`,
      version: APP_VERSION,
      database: db.connected ? "connected" : "disconnected",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      requestId: getRequestId(req)
    });
  } catch {
    res.status(503).json({
      status: "unavailable",
      service: `${APP_NAME} Media Gateway`,
      version: APP_VERSION,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
app.get("/api/version", (_req, res) => {
  res.json({ name: APP_NAME, version: APP_VERSION });
});
app.get(["/api/public-config", "/public-config"], noStore, (_req, res) => {
  res.json({ success: true, config: publicConfig() });
});
app.get(["/api/announcement", "/announcement"], noStore, (_req, res) => {
  res.json({
    active: systemConfig.announcementActive,
    message: systemConfig.announcement,
    level: systemConfig.announcementLevel,
    maintenanceMode: systemConfig.maintenanceMode
  });
});
app.get(
  ["/api/media-history", "/media-history"],
  noStore,
  async (req, res) => {
    const limit = parseLimit(req.query.limit, 8, 24);
    const items = await getPublicMediaHistorySql(limit, systemConfig.nsfwEnabled);
    res.json({ success: true, items });
  }
);
app.post(
  ["/api/extract", "/extract"],
  maintenanceGate,
  apiLimiter,
  async (req, res) => {
    const startTime = Date.now();
    const { url, platform: requestedPlatform, preferAudio } = req.body || {};
    if (typeof url !== "string" || !url.trim() || url.length > 4096) {
      sendError(req, res, 400, "A valid media URL is required.", "INVALID_URL");
      return;
    }
    const cleanUrl = url.trim();
    const detected = detectPlatform(cleanUrl);
    const platform = requestedPlatform && requestedPlatform !== "auto" && typeof requestedPlatform === "string" ? requestedPlatform : detected;
    if (!nsfwGateFor(platform, cleanUrl)) {
      sendError(req, res, 403, "18+ content is disabled on this deployment.", "NSFW_DISABLED");
      return;
    }
    if (!isHttpUrl(cleanUrl)) {
      sendError(req, res, 400, "Only http:// and https:// media links are supported.", "INVALID_URL");
      return;
    }
    try {
      await assertSafeHttpUrl(cleanUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
    } catch (error) {
      sendError(req, res, 400, error.message || "This URL is not allowed.", "URL_BLOCKED");
      return;
    }
    const clientIp = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "Unknown");
    const requestId = getRequestId(req);
    const fetchUpstream = async (targetPlatform, isFallback = false) => {
      const targetBase = systemConfig.baseUrl;
      let upstreamUrl = "";
      let options = {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(isFallback ? 12e3 : 2e4)
      };
      if (targetPlatform === "youtube") {
        const endpoint = preferAudio ? "ytmp3" : "ytmp4";
        upstreamUrl = `${targetBase}/download/${endpoint}?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "facebook") {
        upstreamUrl = `${targetBase}/download/facebookv2`;
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json"
          },
          body: JSON.stringify({ url: cleanUrl }),
          signal: AbortSignal.timeout(isFallback ? 12e3 : 2e4)
        };
      } else if (targetPlatform === "terabox") {
        upstreamUrl = `${targetBase}/download/terabox?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "xnxx") {
        upstreamUrl = `${targetBase}/nsfw/xnxx-dl?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "xvideos") {
        upstreamUrl = `${targetBase}/nsfw/xvideos-dl?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "instagram") {
        upstreamUrl = `${targetBase}/download/instagram?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "tiktok") {
        upstreamUrl = `${targetBase}/download/tiktokv2?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === "pinterest") {
        upstreamUrl = `${targetBase}/download/pinterestV2?url=${encodeURIComponent(cleanUrl)}`;
      } else {
        upstreamUrl = `${targetBase}/download/aiov2?url=${encodeURIComponent(cleanUrl)}`;
      }
      const response = await fetch(upstreamUrl, options);
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const failed = !response.ok || !json || json.status === false && !json.data || json.success === false && !json.data;
      if (failed) {
        const errorMessage = json?.error || json?.message || (text && !text.trim().startsWith("<") ? text.slice(0, 180) : `Upstream returned HTTP ${response.status}`);
        const error = new Error(errorMessage);
        error.statusCode = response.status;
        throw error;
      }
      return { json, response };
    };
    try {
      let result = null;
      let fallbackApplied = false;
      let effectivePlatform = platform;
      try {
        result = await fetchUpstream(platform);
      } catch (primaryError) {
        if (platform === "aio") throw primaryError;
        try {
          result = await fetchUpstream("aio", true);
          fallbackApplied = true;
          effectivePlatform = "aio";
        } catch {
          throw primaryError;
        }
      }
      const normalized = normalizeMediaResponse(effectivePlatform, result.json, cleanUrl);
      const hasContent = normalized.streams.length > 0 || normalized.downloads.length > 0 || Boolean(normalized.streamUrl) || Boolean(normalized.galleryImages?.length) || Boolean(normalized.teraboxData?.files.length);
      if (!hasContent) {
        throw new Error("The upstream gateway returned no playable formats for this URL.");
      }
      if (!normalized.title || normalized.title === "Extracted Media") {
        normalized.title = `${effectivePlatform.toUpperCase()} media`;
      }
      void saveMediaHistorySql(normalized).catch(() => {
      });
      const latency = Date.now() - startTime;
      logPublicRequest(req, {
        platform: effectivePlatform,
        action: "extract",
        input: cleanUrl,
        status: 200,
        latencyMs: latency,
        payloadSummary: `${normalized.title.slice(0, 120)} (${normalized.downloads.length} formats)`,
        requestId
      });
      res.json({
        success: true,
        platform: effectivePlatform,
        data: normalized,
        latencyMs: latency,
        fallbackApplied,
        requestId
      });
    } catch (error) {
      const latency = Date.now() - startTime;
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("timed out");
      const status = isTimeout ? 504 : 502;
      const message = isTimeout ? "The media gateway timed out. Please try again." : error.message || "Media extraction failed.";
      logPublicRequest(req, {
        platform,
        action: "extract",
        input: cleanUrl,
        status,
        latencyMs: latency,
        error: message,
        requestId
      });
      sendError(req, res, status, message, isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR");
    }
  }
);
app.get(
  ["/api/search", "/search"],
  maintenanceGate,
  searchGate,
  apiLimiter,
  async (req, res) => {
    const startTime = Date.now();
    const type = String(req.query.type || "youtube").toLowerCase();
    const query = String(req.query.q || "").trim();
    if (!query) {
      sendError(req, res, 400, "Search query is required.", "MISSING_QUERY");
      return;
    }
    if (query.length > 160) {
      sendError(req, res, 400, "Search query is too long.", "QUERY_TOO_LONG");
      return;
    }
    if (!["youtube", "pinterest", "xnxx", "xvideos"].includes(type)) {
      sendError(req, res, 400, "Unsupported search engine.", "INVALID_TYPE");
      return;
    }
    if ((type === "xnxx" || type === "xvideos") && !systemConfig.nsfwEnabled) {
      sendError(req, res, 403, "18+ content is disabled on this deployment.", "NSFW_DISABLED");
      return;
    }
    try {
      const targetBase = systemConfig.baseUrl;
      let endpoint = `${targetBase}/search/youtube?q=${encodeURIComponent(query)}`;
      if (type === "pinterest") endpoint = `${targetBase}/search/pinterest?q=${encodeURIComponent(query)}`;
      else if (type === "xnxx") endpoint = `${targetBase}/nsfw/xnxx-search?query=${encodeURIComponent(query)}`;
      else if (type === "xvideos") endpoint = `${targetBase}/nsfw/xvideos-search?query=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(15e3)
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!response.ok || !json) {
        throw new Error(json?.error || `Search gateway returned HTTP ${response.status}`);
      }
      const rawList = Array.isArray(json.data) ? json.data : Array.isArray(json.videos) ? json.videos : Array.isArray(json.results) ? json.results : Array.isArray(json) ? json : [];
      const normalized = normalizeSearchResults(type, rawList);
      if ((type === "xnxx" || type === "xvideos") && systemConfig.nsfwEnabled) {
        await Promise.allSettled(
          normalized.slice(0, 16).map(async (item) => {
            const thumb = String(item.thumbnail || "");
            const link = String(item.link || "");
            if (!thumb || thumb.includes("blank.gif") || thumb.length < 12) {
              const resolved = await resolveNsfwThumbnail(link);
              if (resolved) {
                item.thumbnail = resolved;
                item.imageUrl = resolved;
              }
            }
          })
        );
      }
      const latency = Date.now() - startTime;
      logPublicRequest(req, {
        platform: type,
        action: "search",
        input: query,
        status: 200,
        latencyMs: latency,
        payloadSummary: `${normalized.length} results`
      });
      res.json({
        success: true,
        type,
        query,
        data: normalized,
        count: normalized.length,
        latencyMs: latency
      });
    } catch (error) {
      const latency = Date.now() - startTime;
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      logPublicRequest(req, {
        platform: type,
        action: "search",
        input: query,
        status: isTimeout ? 504 : 502,
        latencyMs: latency,
        error: error.message
      });
      sendError(
        req,
        res,
        isTimeout ? 504 : 502,
        isTimeout ? "Search timed out. Please try again." : error.message || "Search failed.",
        isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR"
      );
    }
  }
);
app.get(
  ["/api/youtube-transcript", "/youtube-transcript"],
  maintenanceGate,
  apiLimiter,
  async (req, res) => {
    const targetUrl = String(req.query.url || "");
    if (!targetUrl || targetUrl.length > 2048 || detectPlatform(targetUrl) !== "youtube") {
      sendError(req, res, 400, "A valid YouTube URL is required.", "INVALID_URL");
      return;
    }
    try {
      const endpoint = `${systemConfig.baseUrl}/tools/youtube-transcript?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(endpoint, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(15e3)
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) {
        throw new Error(json?.error || `Transcript gateway returned HTTP ${response.status}`);
      }
      const data = json.data || json;
      let transcript = data.transcript || data.captions || data.subtitles || [];
      if (!Array.isArray(transcript) && Array.isArray(data.data)) transcript = data.data;
      const normalizedTranscript = (Array.isArray(transcript) ? transcript : []).map((item) => {
        if (typeof item === "string") return { text: item, start: 0, duration: 0 };
        return {
          text: String(item.text || item.content || item.caption || ""),
          start: Number(item.start ?? item.offset ?? item.from ?? 0) || 0,
          duration: Number(item.duration ?? item.dur ?? 0) || 0
        };
      }).filter((item) => item.text);
      if (normalizedTranscript.length === 0) {
        throw new Error("No transcript is available for this video.");
      }
      void recordLogSql({
        platform: "youtube",
        action: "extract",
        input: targetUrl,
        status: 200,
        latencyMs: 0,
        clientIp: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || "Unknown"),
        payloadSummary: `${normalizedTranscript.length} transcript lines`,
        requestId: getRequestId(req)
      }).catch(() => {
      });
      res.json({ success: true, data: { transcript: normalizedTranscript } });
    } catch (error) {
      sendError(req, res, 502, error.message || "Transcript extraction failed.", "UPSTREAM_ERROR");
    }
  }
);
app.get(
  ["/api/proxy-image", "/proxy-image"],
  apiLimiter,
  async (req, res) => {
    const imageUrl = String(req.query.url || "");
    if (!imageUrl || imageUrl.length > 4096) {
      sendError(req, res, 400, "Missing or invalid image URL.");
      return;
    }
    try {
      const upstream = await safeFetch(
        imageUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
          },
          signal: AbortSignal.timeout(8e3)
        },
        { allowPrivate: ALLOW_PRIVATE_PROXY }
      );
      if (!upstream.ok) {
        res.redirect(302, imageUrl);
        return;
      }
      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (!contentType.toLowerCase().startsWith("image/")) {
        sendError(req, res, 415, "The remote resource is not an image.");
        return;
      }
      const contentLength = Number(upstream.headers.get("content-length") || 0);
      if (contentLength > 12 * 1024 * 1024) {
        sendError(req, res, 413, "Image is too large to proxy.");
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.byteLength > 12 * 1024 * 1024) {
        sendError(req, res, 413, "Image is too large to proxy.");
        return;
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.send(buffer);
    } catch (error) {
      sendError(req, res, 502, error.message || "Image proxy failed.");
    }
  }
);
app.get(
  ["/api/proxy-stream", "/proxy-stream"],
  maintenanceGate,
  apiLimiter,
  async (req, res) => {
    const targetUrl = String(req.query.url || "");
    if (!targetUrl || targetUrl.length > 8192) {
      sendError(req, res, 400, "Missing or invalid media URL.");
      return;
    }
    const startTime = Date.now();
    let validated = false;
    let aborted = false;
    const controller = new AbortController();
    const headerTimeout = setTimeout(() => controller.abort(), 25e3);
    const abortOnClose = () => {
      if (!res.writableEnded) {
        aborted = true;
        controller.abort();
      }
    };
    req.on("aborted", abortOnClose);
    res.on("close", abortOnClose);
    try {
      await assertSafeHttpUrl(targetUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
      validated = true;
      const range = req.headers.range;
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*"
      };
      if (range) headers.Range = range;
      try {
        headers.Referer = `${new URL(targetUrl).origin}/`;
      } catch {
      }
      const upstream = await safeFetch(
        targetUrl,
        { headers, signal: controller.signal },
        { allowPrivate: ALLOW_PRIVATE_PROXY }
      );
      clearTimeout(headerTimeout);
      if (!upstream.ok && upstream.status !== 206) {
        throw new Error(`Upstream media responded with HTTP ${upstream.status}`);
      }
      const contentType = upstream.headers.get("content-type") || "video/mp4";
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges") || "bytes";
      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", acceptRanges);
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      logPublicRequest(req, {
        platform: detectPlatform(targetUrl),
        action: "stream",
        input: targetUrl,
        status: upstream.status,
        latencyMs: Date.now() - startTime,
        payloadSummary: contentType
      });
      if (!upstream.body) {
        res.end();
        return;
      }
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
      clearTimeout(headerTimeout);
      if (aborted || res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (validated) {
        res.redirect(302, targetUrl);
        return;
      }
      sendError(req, res, 502, error.message || "Media proxy failed.", "PROXY_ERROR");
    } finally {
      clearTimeout(headerTimeout);
      req.off("aborted", abortOnClose);
      res.off("close", abortOnClose);
    }
  }
);
app.get(
  ["/api/proxy-download", "/proxy-download"],
  maintenanceGate,
  downloadsGate,
  apiLimiter,
  async (req, res) => {
    const targetUrl = String(req.query.url || "");
    const requestedFilename = String(req.query.filename || `streampulse_${Date.now()}.mp4`);
    if (!targetUrl || targetUrl.length > 8192) {
      sendError(req, res, 400, "Missing or invalid download URL.");
      return;
    }
    const startTime = Date.now();
    let validated = false;
    const controller = new AbortController();
    const headerTimeout = setTimeout(() => controller.abort(), 25e3);
    try {
      await assertSafeHttpUrl(targetUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
      validated = true;
      const upstream = await safeFetch(
        targetUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "*/*",
            ...req.headers.range ? { Range: String(req.headers.range) } : {}
          },
          signal: controller.signal
        },
        { allowPrivate: ALLOW_PRIVATE_PROXY }
      );
      clearTimeout(headerTimeout);
      if (!upstream.ok && upstream.status !== 206) {
        throw new Error(`Upstream file responded with HTTP ${upstream.status}`);
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", buildContentDisposition(requestedFilename));
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      logPublicRequest(req, {
        platform: detectPlatform(targetUrl),
        action: "download",
        input: targetUrl,
        status: upstream.status,
        latencyMs: Date.now() - startTime,
        payloadSummary: `${sanitizeFilename(requestedFilename)} (${contentType})`
      });
      if (!upstream.body) {
        res.end();
        return;
      }
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
      clearTimeout(headerTimeout);
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (validated) {
        res.redirect(302, targetUrl);
        return;
      }
      sendError(req, res, 502, error.message || "Download proxy failed.", "PROXY_ERROR");
    } finally {
      clearTimeout(headerTimeout);
    }
  }
);
app.post("/api/admin/login", noStore, async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || password.length > 256) {
    sendError(req, res, 400, "Password is required.", "INVALID_REQUEST");
    return;
  }
  const clientIp = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "Unknown").slice(0, 400);
  try {
    const session = await adminAuth.login(password, clientIp, userAgent);
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: "Admin authenticated successfully",
      status: 200,
      latencyMs: 1,
      payloadSummary: "New admin session issued"
    });
    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      sessionTtlHours: adminAuth.sessionTtl
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: "Failed admin login attempt",
      status,
      latencyMs: 1,
      error: error.message
    });
    sendError(req, res, status, error.message || "Login failed.", "AUTH_FAILED");
  }
});
app.get("/api/admin/session", requireAdmin, (req, res) => {
  const admin = req.admin;
  res.json({
    success: true,
    session: { id: admin.sid, expiresAt: admin.expiresAt },
    sessionTtlHours: adminAuth.sessionTtl,
    environment: process.env.NODE_ENV || "development",
    version: APP_VERSION
  });
});
app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  const token = req.adminToken || "";
  await adminAuth.logout(token);
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: "Admin session logged out",
    status: 200,
    latencyMs: 1
  });
  res.json({ success: true });
});
app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  const sqlStats = await getAdminStatsSql();
  const useMemory = sqlStats.totalRequests === 0 && memoryStats.totalRequests > 0;
  const merged = {
    ...useMemory ? memoryStats : sqlStats,
    totalRequests: Math.max(sqlStats.totalRequests, memoryStats.totalRequests),
    successfulRequests: Math.max(sqlStats.successfulRequests, memoryStats.successfulRequests),
    failedRequests: Math.max(sqlStats.failedRequests, memoryStats.failedRequests),
    totalStreams: Math.max(sqlStats.totalStreams, memoryStats.totalStreams),
    totalDownloads: Math.max(sqlStats.totalDownloads, memoryStats.totalDownloads),
    averageLatencyMs: sqlStats.averageLatencyMs || memoryStats.averageLatencyMs
  };
  const diagnostics = await buildDiagnostics();
  merged.uptimeSeconds = diagnostics.uptimeSeconds;
  merged.memoryUsageMB = diagnostics.memoryUsageMB;
  merged.diagnostics = diagnostics;
  res.json({ success: true, stats: merged, runtime: getRuntimeInfo() });
});
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  const hours = parseLimit(req.query.hours, 24, 720);
  const [series, top, recentErrors] = await Promise.all([
    getAnalyticsSeriesSql(hours),
    getTopAnalyticsSql(),
    queryLogsSql({ status: "error", limit: 10 })
  ]);
  res.json({
    success: true,
    hours,
    series,
    ...top,
    recentErrors: recentErrors.logs
  });
});
app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  const filters = {
    platform: typeof req.query.platform === "string" ? req.query.platform : void 0,
    action: typeof req.query.action === "string" ? req.query.action : void 0,
    status: typeof req.query.status === "string" ? req.query.status : void 0,
    q: typeof req.query.q === "string" ? req.query.q.slice(0, 200) : void 0,
    from: typeof req.query.from === "string" ? req.query.from : void 0,
    to: typeof req.query.to === "string" ? req.query.to : void 0,
    limit: parseLimit(req.query.limit, 100, 1e3),
    offset: Math.max(Number(req.query.offset) || 0, 0)
  };
  const data = await queryLogsSql(filters);
  let logs = data.logs;
  let total = data.total;
  if (total === 0 && logs.length === 0 && auditLogs.length > 0) {
    const filtered = auditLogs.filter((log) => {
      if (filters.platform && filters.platform !== "all" && log.platform.toLowerCase() !== filters.platform.toLowerCase()) return false;
      if (filters.action && filters.action !== "all" && log.action.toLowerCase() !== filters.action.toLowerCase()) return false;
      if (filters.status === "success" && log.status >= 400) return false;
      if (filters.status === "error" && log.status < 400) return false;
      if (filters.q && !`${log.input} ${log.error || ""} ${log.payloadSummary || ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    });
    total = filtered.length;
    logs = filtered.slice(filters.offset, filters.offset + filters.limit);
  }
  res.json({ success: true, total, limit: filters.limit, offset: filters.offset, logs });
});
app.delete("/api/admin/logs/:id", requireAdmin, async (req, res) => {
  const deleted = await deleteLogSql(String(req.params.id));
  const index = auditLogs.findIndex((log) => log.id === req.params.id);
  if (index >= 0) auditLogs.splice(index, 1);
  res.json({ success: true, deleted });
});
app.delete("/api/admin/logs", requireAdmin, (req, res) => {
  void (async () => {
    await clearLogsSql();
    auditLogs.length = 0;
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: "Audit logs cleared by administrator",
      status: 200,
      latencyMs: 1
    });
    res.json({ success: true });
  })();
});
app.post("/api/admin/logs/prune", requireAdmin, async (req, res) => {
  const days = parseLimit(req.body?.days, 30, 3650);
  const deleted = await deleteOldLogsSql(days);
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: `Pruned audit logs older than ${days} day(s)`,
    status: 200,
    latencyMs: 1,
    payloadSummary: `${deleted} rows removed`
  });
  res.json({ success: true, deleted, days });
});
app.get("/api/admin/media", requireAdmin, async (req, res) => {
  const data = await queryMediaHistorySql({
    q: typeof req.query.q === "string" ? req.query.q.slice(0, 200) : void 0,
    platform: typeof req.query.platform === "string" ? req.query.platform : void 0,
    limit: parseLimit(req.query.limit, 50, 200),
    offset: Math.max(Number(req.query.offset) || 0, 0)
  });
  res.json({ success: true, ...data });
});
app.delete("/api/admin/media/:id", requireAdmin, async (req, res) => {
  const deleted = await deleteMediaHistorySql(String(req.params.id));
  res.json({ success: true, deleted });
});
app.delete("/api/admin/media", requireAdmin, async (req, res) => {
  await clearMediaHistorySql();
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: "Media history cleared by administrator",
    status: 200,
    latencyMs: 1
  });
  res.json({ success: true });
});
app.get("/api/admin/config", requireAdmin, async (_req, res) => {
  const saved = await getSystemConfigSql();
  Object.assign(systemConfig, saved);
  res.json({
    success: true,
    config: systemConfig,
    runtime: getRuntimeInfo()
  });
});
app.post("/api/admin/config", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const updates = {};
  try {
    if (body.baseUrl !== void 0) {
      updates.baseUrl = validateConfiguredBaseUrl(body.baseUrl);
    }
    if (body.announcement !== void 0) {
      const text = String(body.announcement).trim();
      if (text.length > 300) throw new Error("Announcement must be 300 characters or fewer");
      updates.announcement = text;
    }
    if (body.announcementActive !== void 0) {
      if (typeof body.announcementActive !== "boolean") throw new Error("announcementActive must be a boolean");
      updates.announcementActive = body.announcementActive;
    }
    if (body.announcementLevel !== void 0) {
      if (!["info", "success", "warning", "critical"].includes(body.announcementLevel)) {
        throw new Error("Invalid announcement level");
      }
      updates.announcementLevel = body.announcementLevel;
    }
    if (body.rateLimitEnabled !== void 0) {
      if (typeof body.rateLimitEnabled !== "boolean") throw new Error("rateLimitEnabled must be a boolean");
      updates.rateLimitEnabled = body.rateLimitEnabled;
    }
    if (body.rateLimitRpm !== void 0) {
      const rpm = Number(body.rateLimitRpm);
      if (!Number.isFinite(rpm)) throw new Error("rateLimitRpm must be a number");
      updates.rateLimitRpm = clamp(Math.round(rpm), 5, 600);
    }
    if (body.maintenanceMode !== void 0) {
      if (typeof body.maintenanceMode !== "boolean") throw new Error("maintenanceMode must be a boolean");
      updates.maintenanceMode = body.maintenanceMode;
    }
    if (body.nsfwEnabled !== void 0) {
      if (typeof body.nsfwEnabled !== "boolean") throw new Error("nsfwEnabled must be a boolean");
      updates.nsfwEnabled = body.nsfwEnabled;
    }
    if (body.searchEnabled !== void 0) {
      if (typeof body.searchEnabled !== "boolean") throw new Error("searchEnabled must be a boolean");
      updates.searchEnabled = body.searchEnabled;
    }
    if (body.downloadsEnabled !== void 0) {
      if (typeof body.downloadsEnabled !== "boolean") throw new Error("downloadsEnabled must be a boolean");
      updates.downloadsEnabled = body.downloadsEnabled;
    }
  } catch (error) {
    sendError(req, res, 400, error.message || "Invalid configuration.", "INVALID_CONFIG");
    return;
  }
  await updateSystemConfigSql(updates);
  Object.assign(systemConfig, updates);
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: "System configuration updated",
    status: 200,
    latencyMs: 1,
    payloadSummary: `Maintenance=${systemConfig.maintenanceMode}, RateLimit=${systemConfig.rateLimitEnabled}, NSFW=${systemConfig.nsfwEnabled}`
  });
  res.json({ success: true, config: systemConfig, runtime: getRuntimeInfo() });
});
app.get("/api/admin/health", requireAdmin, async (req, res) => {
  const single = typeof req.query.endpoint === "string" ? req.query.endpoint.toLowerCase() : "";
  let endpoints = getHealthEndpoints();
  if (single) endpoints = endpoints.filter((endpoint) => endpoint.name.toLowerCase().includes(single));
  const results = await Promise.all(
    endpoints.map(async (endpoint) => {
      const started = Date.now();
      if (endpoint.nsfw && !systemConfig.nsfwEnabled) {
        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: "disabled",
          latencyMs: 0,
          lastChecked: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            "User-Agent": `${APP_NAME}-Health-Probe/1.0`,
            "Content-Type": "application/json"
          },
          body: endpoint.method === "POST" ? JSON.stringify(endpoint.body || {}) : void 0,
          signal: AbortSignal.timeout(8e3)
        });
        const sample = await readResponseSample(response, 700);
        const latency = Date.now() - started;
        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: response.status < 500 ? "online" : "degraded",
          latencyMs: latency,
          statusCode: response.status,
          lastChecked: (/* @__PURE__ */ new Date()).toISOString(),
          sampleResponse: sample.text.slice(0, 700),
          contentType: response.headers.get("content-type") || void 0
        };
      } catch {
        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: "offline",
          latencyMs: Date.now() - started,
          statusCode: 0,
          lastChecked: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
    })
  );
  res.json({ success: true, timestamp: (/* @__PURE__ */ new Date()).toISOString(), endpoints: results });
});
app.post("/api/admin/test-endpoint", requireAdmin, async (req, res) => {
  const { url, method = "GET", body, headers = {} } = req.body || {};
  if (typeof url !== "string" || !url.trim()) {
    sendError(req, res, 400, "Endpoint URL is required.", "INVALID_URL");
    return;
  }
  const upperMethod = String(method).toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(upperMethod)) {
    sendError(req, res, 400, "Unsupported HTTP method.", "INVALID_METHOD");
    return;
  }
  const safeHeaders = {};
  const blockedHeaders = /* @__PURE__ */ new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade"]);
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== "string" || blockedHeaders.has(key.toLowerCase())) continue;
      safeHeaders[key] = value.slice(0, 2e3);
    }
  }
  const started = Date.now();
  try {
    await assertSafeHttpUrl(url, {
      allowPrivate: ALLOW_PRIVATE_PROXY || !IS_PRODUCTION
    });
    const init = {
      method: upperMethod,
      headers: {
        "User-Agent": `${APP_NAME}-Admin-Sandbox/1.0`,
        Accept: "application/json, text/plain, */*",
        ...safeHeaders
      },
      signal: AbortSignal.timeout(2e4)
    };
    if (!["GET", "HEAD"].includes(upperMethod) && body !== void 0) {
      if (typeof body === "string") {
        init.body = body;
      } else {
        init.body = JSON.stringify(body);
        if (!Object.keys(safeHeaders).some((key) => key.toLowerCase() === "content-type")) {
          init.headers["Content-Type"] = "application/json";
        }
      }
    }
    const response = await safeFetch(url, init, {
      allowPrivate: ALLOW_PRIVATE_PROXY || !IS_PRODUCTION
    });
    const latency = Date.now() - started;
    const contentType = response.headers.get("content-type") || "";
    const sample = await readResponseSample(response, 2e5);
    let data = sample.text;
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(sample.text);
      } catch {
        data = sample.text;
      }
    }
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: `Sandbox ${upperMethod} ${url}`.slice(0, 600),
      status: 200,
      latencyMs: latency,
      payloadSummary: `HTTP ${response.status}, ${sample.bytes} bytes`
    });
    res.json({
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
      latencyMs: latency,
      contentType,
      bytes: sample.bytes,
      truncated: sample.truncated,
      headers: responseHeaders,
      data,
      requestId: getRequestId(req)
    });
  } catch (error) {
    sendError(req, res, 502, error.message || "Request failed.", "SANDBOX_ERROR");
  }
});
app.get("/api/admin/database/download", requireAdmin, (req, res) => {
  if (isRemoteDatabase()) {
    sendError(
      req,
      res,
      409,
      "This deployment uses a remote libSQL/Turso database. Use the JSON snapshot export or the Turso dashboard instead.",
      "REMOTE_DATABASE"
    );
    return;
  }
  const dbPath = getDatabasePath();
  if (!fs2.existsSync(dbPath)) {
    sendError(req, res, 404, "Database file not found on disk yet.", "NOT_FOUND");
    return;
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const filename = `streampulse_backup_${timestamp}.db`;
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: `Downloaded SQLite backup (${filename})`,
    status: 200,
    latencyMs: 1
  });
  res.download(dbPath, filename, (error) => {
    if (error && !res.headersSent) {
      sendError(req, res, 500, "Failed to send database file.", "DOWNLOAD_FAILED");
    }
  });
});
app.get("/api/admin/database/export", requireAdmin, async (req, res) => {
  const snapshot = await exportDatabaseSnapshotSql();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const payload = JSON.stringify(snapshot, null, 2);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    buildContentDisposition(`streampulse_snapshot_${timestamp}.json`)
  );
  res.send(payload);
});
app.post("/api/admin/database/optimize", requireAdmin, async (req, res) => {
  if (isRemoteDatabase()) {
    sendError(req, res, 409, "Optimization is only available for local SQLite deployments.", "REMOTE_DATABASE");
    return;
  }
  try {
    const db = await initDatabase();
    await db.execute("PRAGMA optimize");
    await db.execute("VACUUM");
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: "SQLite database optimized (PRAGMA optimize + VACUUM)",
      status: 200,
      latencyMs: 1
    });
    res.json({ success: true });
  } catch (error) {
    sendError(req, res, 500, error.message || "Database optimization failed.", "DB_ERROR");
  }
});
app.post("/api/admin/reset-stats", requireAdmin, async (req, res) => {
  await resetStatsSql();
  memoryStats.totalRequests = 0;
  memoryStats.successfulRequests = 0;
  memoryStats.failedRequests = 0;
  memoryStats.totalStreams = 0;
  memoryStats.totalDownloads = 0;
  memoryStats.averageLatencyMs = 0;
  memoryStats.recentErrorsCount = 0;
  memoryStats.platformBreakdown = {};
  memoryStats.actionBreakdown = {};
  latencySamples.length = 0;
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: "Telemetry counters reset",
    status: 200,
    latencyMs: 1
  });
  res.json({ success: true });
});
app.post("/api/admin/change-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    sendError(req, res, 400, "currentPassword and newPassword are required.", "INVALID_REQUEST");
    return;
  }
  try {
    await adminAuth.changePassword(
      currentPassword,
      newPassword,
      req.admin.sid
    );
    logPublicRequest(req, {
      platform: "system",
      action: "admin",
      input: "Admin password changed",
      status: 200,
      latencyMs: 1
    });
    res.json({ success: true, message: "Password updated. Other admin sessions were revoked." });
  } catch (error) {
    sendError(
      req,
      res,
      error instanceof AuthError ? error.statusCode : 400,
      error.message || "Could not update the password.",
      "PASSWORD_ERROR"
    );
  }
});
app.get("/api/admin/sessions", requireAdmin, async (req, res) => {
  const currentSid = req.admin.sid;
  const sessions = await adminAuth.listSessions(currentSid);
  res.json({ success: true, sessions, currentSessionId: currentSid });
});
app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
  try {
    await adminAuth.revokeSession(String(req.params.id), req.admin.sid);
    res.json({ success: true });
  } catch (error) {
    sendError(req, res, error instanceof AuthError ? error.statusCode : 400, error.message);
  }
});
app.post("/api/admin/sessions/revoke-others", requireAdmin, async (req, res) => {
  await adminAuth.revokeOtherSessions(req.admin.sid);
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: "All other admin sessions revoked",
    status: 200,
    latencyMs: 1
  });
  res.json({ success: true });
});
app.get("/api/admin/security/ips", requireAdmin, async (req, res) => {
  const ips = await listBlockedIpsSql();
  res.json({ success: true, ips, currentIp: getClientIp(req) });
});
app.post("/api/admin/security/ips", requireAdmin, async (req, res) => {
  const rawIp = String(req.body?.ip || "").trim();
  const ip = rawIp.replace(/^\[|\]$/g, "");
  if (!net2.isIP(ip)) {
    sendError(req, res, 400, "Enter a valid IPv4 or IPv6 address.", "INVALID_IP");
    return;
  }
  if (ip === getClientIp(req)) {
    sendError(req, res, 400, "You cannot block the IP address you are currently using.", "SELF_BLOCK");
    return;
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "";
  await addBlockedIpSql(ip, reason);
  blockedIps.add(ip);
  logPublicRequest(req, {
    platform: "system",
    action: "admin",
    input: `Blocked IP ${ip}`,
    status: 200,
    latencyMs: 1,
    payloadSummary: reason
  });
  res.json({ success: true, ip });
});
app.delete("/api/admin/security/ips/:ip", requireAdmin, async (req, res) => {
  const ip = String(req.params.ip || "").replace(/^\[|\]$/g, "");
  const removed = await removeBlockedIpSql(ip);
  blockedIps.delete(ip);
  res.json({ success: true, removed });
});
app.use("/api", (req, res) => {
  sendError(req, res, 404, `No API route matches ${req.method} ${req.originalUrl}.`, "NOT_FOUND");
});
app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === "entity.parse.failed") {
    sendError(req, res, 400, "Malformed JSON request body.", "BAD_JSON");
    return;
  }
  if (error?.type === "entity.too.large") {
    sendError(req, res, 413, "Request body is too large.", "PAYLOAD_TOO_LARGE");
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  sendError(req, res, 500, "Internal server error. Check the server logs for details.", "INTERNAL_ERROR");
});
async function startServer() {
  await initializeApp();
  if (!IS_PRODUCTION && fs2.existsSync(path2.resolve(__dirname, "src"))) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[boot] Vite dev middleware enabled");
  } else if (!IS_VERCEL) {
    const distPath = path2.resolve(__dirname, "dist");
    if (fs2.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.includes(`${path2.sep}assets${path2.sep}`)) {
              res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            } else if (filePath.endsWith("index.html")) {
              res.setHeader("Cache-Control", "no-cache");
            }
          }
        })
      );
      app.get("*", (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path2.resolve(distPath, "index.html"));
      });
      console.log(`[boot] Serving static client from ${distPath}`);
    } else {
      console.warn('[boot] dist/ not found. Run "npm run build" before starting in production.');
    }
  }
  httpServer = app.listen(PORT, HOST, () => {
    console.log(`> ${APP_NAME} v${APP_VERSION} running at http://${HOST}:${PORT}`);
    console.log(`> Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`> Admin session TTL: ${adminAuth.sessionTtl}h`);
  });
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 6e4;
  const shutdown = async (signal) => {
    console.log(`[shutdown] Received ${signal}. Closing connections...`);
    httpServer?.close();
    await closeDatabase().catch(() => {
    });
    setTimeout(() => process.exit(0), 5e3).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
if (!IS_VERCEL) {
  startServer().catch((error) => {
    console.error("Failed to start StreamPulse:", error);
    process.exit(1);
  });
}
var server_default = app;
export {
  app,
  server_default as default
};
