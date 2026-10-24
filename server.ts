import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Server } from 'node:http';
import dotenv from 'dotenv';

import { detectPlatform, normalizeMediaResponse } from './src/utils/mediaParser';
import type {
  AdminStats,
  EndpointHealth,
  LogEntry,
  PlatformType,
  PublicConfig,
  SystemConfig,
  UniversalMediaItem,
} from './src/types';
import {
  addBlockedIpSql,
  clearLogsSql,
  clearMediaHistorySql,
  closeDatabase,
  countActiveAdminSessionsSql,
  deleteLogSql,
  deleteMediaHistorySql,
  deleteOldLogsSql,
  exportDatabaseSnapshotSql,
  getAdminStatsSql,
  getAnalyticsSeriesSql,
  getDatabaseDiagnostics,
  getDatabasePath,
  getPublicMediaHistorySql,
  getRecentMediaHistorySql,
  getSystemConfigSql,
  getTopAnalyticsSql,
  initDatabase,
  isRemoteDatabase,
  listAdminSessionsSql,
  listBlockedIpsSql,
  pruneAdminSessionsSql,
  queryLogsSql,
  queryMediaHistorySql,
  recordLogSql,
  removeBlockedIpSql,
  resetStatsSql,
  revokeAllAdminSessionsSql,
  saveMediaHistorySql,
  updateSystemConfigSql,
} from './src/db/sqlite';
import { adminAuth, AuthError } from './src/server/auth';
import {
  assertSafeHttpUrl,
  buildContentDisposition,
  getClientIp,
  isPrivateIp,
  noStore,
  publicRateLimit,
  safeFetch,
  sanitizeFilename,
  securityHeaders,
} from './src/server/security';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_NAME = 'StreamPulse';
const APP_VERSION = process.env.APP_VERSION || '1.1.0';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const IS_VERCEL = process.env.VERCEL === '1';
const STARTED_AT = new Date().toISOString();
const MAX_MEMORY_LOGS = 500;
const NSFW_PLATFORMS = new Set<PlatformType>(['xnxx', 'xvideos']);
const ALLOW_PRIVATE_PROXY = process.env.ALLOW_PRIVATE_PROXY === 'true';

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : 1);
app.disable('x-powered-by');

const systemConfig: SystemConfig = {
  baseUrl: (process.env.PREXZY_API_BASE_URL || 'https://prexzyapis.com').replace(/\/+$/, ''),
  announcement: 'StreamPulse is online — fast HD streaming, Terabox cloud playback and MP3 extraction.',
  announcementActive: true,
  announcementLevel: 'info',
  rateLimitEnabled: false,
  rateLimitRpm: 60,
  maintenanceMode: false,
  nsfwEnabled: process.env.NSFW_ENABLED !== 'false',
  searchEnabled: true,
  downloadsEnabled: true,
};

const auditLogs: LogEntry[] = [];
const blockedIps = new Set<string>();
let initialized = false;
let bootstrapPromise: Promise<void> | null = null;
let httpServer: Server | null = null;

const memoryStats: AdminStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalStreams: 0,
  totalDownloads: 0,
  averageLatencyMs: 0,
  platformBreakdown: {},
  actionBreakdown: {},
  recentErrorsCount: 0,
};
const latencySamples: number[] = [];
const nsfwThumbCache = new Map<string, string>();

type AuthedRequest = Request & {
  requestId?: string;
  admin?: { sid: string; expiresAt: string };
  adminToken?: string;
};

type FetchResponse = globalThis.Response;

/* ==========================================================================
   HELPERS
   ========================================================================== */

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseLimit(value: unknown, fallback: number, max = 1000): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? clamp(parsed, 1, max) : fallback;
}

function getRequestId(req: Request): string {
  return (req as AuthedRequest).requestId || 'unknown';
}

function getBearerToken(req: Request): string {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

function sendError(
  req: Request,
  res: Response,
  status: number,
  message: string,
  code?: string
): void {
  res.status(status).json({
    error: message,
    code: code || undefined,
    requestId: getRequestId(req),
  });
}

function recordLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  const fullEntry: LogEntry = {
    id: `mem_${Date.now()}_${auditLogs.length}`,
    timestamp: new Date().toISOString(),
    ...entry,
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
    memoryStats.platformBreakdown[entry.platform] =
      (memoryStats.platformBreakdown[entry.platform] || 0) + 1;
  }
  if (entry.action) {
    memoryStats.actionBreakdown[entry.action] =
      (memoryStats.actionBreakdown[entry.action] || 0) + 1;
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
    input: String(entry.input || '').slice(0, 600),
    userAgent: entry.userAgent ? String(entry.userAgent).slice(0, 400) : undefined,
    error: entry.error ? String(entry.error).slice(0, 800) : undefined,
    payloadSummary: entry.payloadSummary ? String(entry.payloadSummary).slice(0, 300) : undefined,
    requestId: entry.requestId,
  }).catch(() => {});
}

function logPublicRequest(
  req: Request,
  entry: Omit<LogEntry, 'id' | 'timestamp' | 'clientIp' | 'userAgent'>
): void {
  recordLog({
    ...entry,
    clientIp: getClientIp(req),
    userAgent: String(req.headers['user-agent'] || 'Unknown'),
    requestId: getRequestId(req),
  });
}

async function initializeApp(): Promise<void> {
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

    await pruneAdminSessionsSql().catch(() => {});

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
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
    pid: process.pid,
    startedAt: STARTED_AT,
    activeSessions,
    cachedLogsCount: Math.max(auditLogs.length, dbDiag.totalLogs),
    database: dbDiag,
  };
}

function getRuntimeInfo() {
  return {
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
    nodeVersion: process.version,
    remoteDatabase: isRemoteDatabase(),
    adminPasswordConfigured: true,
    sessionTtlHours: adminAuth.sessionTtl,
    publicUrl: process.env.PUBLIC_URL || process.env.APP_URL || '',
  };
}

function publicConfig(): PublicConfig {
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
    rateLimitRpm: systemConfig.rateLimitRpm,
  };
}

function validateConfiguredBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Base URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Base URL must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Base URL must use http:// or https://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Base URL must not contain credentials');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function isNsfwRequest(platform: PlatformType, sourceUrl: string): boolean {
  if (NSFW_PLATFORMS.has(platform)) return true;
  const detected = detectPlatform(sourceUrl);
  return NSFW_PLATFORMS.has(detected);
}

// Returns the public endpoint list used by the admin health tester.
function getHealthEndpoints() {
  const base = systemConfig.baseUrl;
  const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  return [
    { name: 'AIO Downloader (aiov2)', url: `${base}/download/aiov2?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`, method: 'GET' as const, nsfw: false },
    { name: 'YouTube Info (ytinfo)', url: `${base}/download/ytinfo?url=${encodeURIComponent(youtubeUrl)}`, method: 'GET' as const, nsfw: false },
    { name: 'YouTube Video (ytmp4)', url: `${base}/download/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, method: 'GET' as const, nsfw: false },
    { name: 'YouTube Audio (ytmp3)', url: `${base}/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, method: 'GET' as const, nsfw: false },
    { name: 'YouTube Transcript', url: `${base}/tools/youtube-transcript?url=${encodeURIComponent(youtubeUrl)}`, method: 'GET' as const, nsfw: false },
    { name: 'Facebook Video (facebookv2)', url: `${base}/download/facebookv2`, method: 'POST' as const, body: { url: 'https://www.facebook.com/reel/1234' }, nsfw: false },
    { name: 'Terabox (terabox)', url: `${base}/download/terabox?url=${encodeURIComponent('https://www.1024tera.com/s/1pLY_llmDlklU2tYse8gEig')}`, method: 'GET' as const, nsfw: false },
    { name: 'TikTok (tiktokv2)', url: `${base}/download/tiktokv2?url=${encodeURIComponent('https://www.tiktok.com/@sample/video/1')}`, method: 'GET' as const, nsfw: false },
    { name: 'Instagram (instagram)', url: `${base}/download/instagram?url=${encodeURIComponent('https://www.instagram.com/p/sample')}`, method: 'GET' as const, nsfw: false },
    { name: 'Pinterest (pinterestV2)', url: `${base}/download/pinterestV2?url=${encodeURIComponent('https://www.pinterest.com/pin/123')}`, method: 'GET' as const, nsfw: false },
    { name: 'XNXX Download', url: `${base}/nsfw/xnxx-dl?url=${encodeURIComponent('https://www.xnxx.com/video-1/sample')}`, method: 'GET' as const, nsfw: true },
    { name: 'Xvideos Download', url: `${base}/nsfw/xvideos-dl?url=${encodeURIComponent('https://www.xvideos.com/video.1/sample')}`, method: 'GET' as const, nsfw: true },
    { name: 'Search YouTube', url: `${base}/search/youtube?q=music`, method: 'GET' as const, nsfw: false },
    { name: 'Search Pinterest', url: `${base}/search/pinterest?q=art`, method: 'GET' as const, nsfw: false },
    { name: 'Search XNXX', url: `${base}/nsfw/xnxx-search?query=dance`, method: 'GET' as const, nsfw: true },
    { name: 'Search Xvideos', url: `${base}/nsfw/xvideos-search?query=dance`, method: 'GET' as const, nsfw: true },
  ];
}

async function readResponseSample(response: FetchResponse, maxBytes = 900): Promise<{ text: string; truncated: boolean; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', truncated: false, bytes: 0 };

  const decoder = new TextDecoder();
  let text = '';
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
    reader.cancel().catch(() => {});
  }

  text += decoder.decode();
  return { text, truncated, bytes };
}

async function resolveNsfwThumbnail(videoUrl: string): Promise<string> {
  if (!systemConfig.nsfwEnabled || !videoUrl) return '';
  const cached = nsfwThumbCache.get(videoUrl);
  if (cached) return cached;

  try {
    const response = await safeFetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return '';

    const sample = await readResponseSample(response, 64 * 1024);
    const match =
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(sample.text) ||
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i.exec(sample.text);

    if (match?.[1]) {
      if (nsfwThumbCache.size > 500) {
        const first = nsfwThumbCache.keys().next().value;
        if (first) nsfwThumbCache.delete(first);
      }
      nsfwThumbCache.set(videoUrl, match[1]);
      return match[1];
    }
  } catch {
    // Ignore thumbnail lookup failures.
  }
  return '';
}

function normalizeSearchResults(type: string, rawList: unknown[]): Array<Record<string, unknown>> {
  return rawList.slice(0, 60).map((raw, index) => {
    if (typeof raw === 'string') {
      return {
        id: `${type}_${index}`,
        type,
        title: type === 'pinterest' ? 'Pinterest pin' : 'Media result',
        imageUrl: raw,
        thumbnail: raw,
        link: raw,
        url: raw,
      };
    }

    const item = (raw || {}) as Record<string, any>;
    const link = String(
      item.link || item.url || item.webpage_url || item.webpageUrl || item.video_url || item.videoUrl || ''
    ).trim();
    let imageUrl = String(
      item.imageUrl || item.thumbnail || item.thumb || item.image || item.cover || item.origin_cover || ''
    ).trim();

    if (!imageUrl && type === 'youtube' && link) {
      const videoId = /(?:v=|youtu\.be\/|shorts\/)([\w-]{6,})/.exec(link)?.[1];
      if (videoId) imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    const author =
      item.channel ||
      item.channelName ||
      item.author?.name ||
      item.author?.nickname ||
      item.uploader?.name ||
      (typeof item.uploader === 'string' ? item.uploader : '') ||
      '';

    const duration =
      typeof item.duration === 'string'
        ? item.duration
        : typeof item.duration === 'number'
          ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`
          : item.timestamp || '';

    return {
      ...item,
      id: String(item.id || `${type}_${index}`),
      type,
      title: String(item.title || item.name || item.caption || 'Untitled media'),
      channel: author || undefined,
      uploader: author || undefined,
      duration: duration || undefined,
      imageUrl,
      thumbnail: imageUrl,
      link: link || imageUrl,
      url: link || imageUrl,
    };
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ==========================================================================
   GLOBAL MIDDLEWARE
   ========================================================================== */

app.use(securityHeaders());
app.use((req, res, next) => {
  const requestId = String(req.headers['x-request-id'] || '') || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  (req as AuthedRequest).requestId = requestId.slice(0, 80);
  res.setHeader('X-Request-Id', (req as AuthedRequest).requestId!);
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

// Optional CORS for people consuming the API from another origin.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (corsOrigins.length > 0) {
  app.use('/api', (req, res, next) => {
    const origin = String(req.headers.origin || '');
    if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Request-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, RateLimit-Remaining');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

// Blocked IPs, checked before any expensive work.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') {
    next();
    return;
  }
  const ip = getClientIp(req);
  if (blockedIps.has(ip)) {
    sendError(req, res, 403, 'Your IP has been blocked by the administrator.', 'IP_BLOCKED');
    return;
  }
  next();
});

// Ensure the database/auth layer is ready (also needed on serverless cold starts).
app.use('/api', async (req, res, next) => {
  try {
    await initializeApp();
    next();
  } catch (error) {
    next(error);
  }
});

const apiLimiter = publicRateLimit(() => ({
  enabled: systemConfig.rateLimitEnabled,
  rpm: systemConfig.rateLimitRpm,
}));

function maintenanceGate(req: Request, res: Response, next: NextFunction): void {
  if (systemConfig.maintenanceMode) {
    sendError(
      req,
      res,
      503,
      'StreamPulse is undergoing scheduled maintenance. Please try again shortly.',
      'MAINTENANCE'
    );
    return;
  }
  next();
}

function searchGate(req: Request, res: Response, next: NextFunction): void {
  if (!systemConfig.searchEnabled) {
    sendError(req, res, 403, 'Search is temporarily disabled by the administrator.', 'SEARCH_DISABLED');
    return;
  }
  next();
}

function downloadsGate(req: Request, res: Response, next: NextFunction): void {
  if (!systemConfig.downloadsEnabled) {
    sendError(req, res, 403, 'Downloads are temporarily disabled by the administrator.', 'DOWNLOADS_DISABLED');
    return;
  }
  next();
}

function nsfwGateFor(platform: PlatformType, sourceUrl: string): boolean {
  if (!systemConfig.nsfwEnabled && isNsfwRequest(platform, sourceUrl)) return false;
  return true;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    sendError(req, res, 401, 'Unauthorized: admin authentication required.', 'UNAUTHORIZED');
    return;
  }

  adminAuth
    .authenticate(token)
    .then(session => {
      if (!session) {
        sendError(req, res, 401, 'Session expired or invalid. Please sign in again.', 'SESSION_EXPIRED');
        return;
      }
      (req as AuthedRequest).admin = session;
      (req as AuthedRequest).adminToken = token;
      next();
    })
    .catch(next);
}

/* ==========================================================================
   PUBLIC ENDPOINTS
   ========================================================================== */

app.get(['/health', '/api/health'], async (req: Request, res: Response): Promise<void> => {
  try {
    await initializeApp();
    const db = await getDatabaseDiagnostics();
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? 'ok' : 'degraded',
      service: `${APP_NAME} Media Gateway`,
      version: APP_VERSION,
      database: db.connected ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
  } catch {
    res.status(503).json({
      status: 'unavailable',
      service: `${APP_NAME} Media Gateway`,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/version', (_req: Request, res: Response): void => {
  res.json({ name: APP_NAME, version: APP_VERSION });
});

app.get(['/api/public-config', '/public-config'], noStore, (_req: Request, res: Response): void => {
  res.json({ success: true, config: publicConfig() });
});

app.get(['/api/announcement', '/announcement'], noStore, (_req: Request, res: Response): void => {
  res.json({
    active: systemConfig.announcementActive,
    message: systemConfig.announcement,
    level: systemConfig.announcementLevel,
    maintenanceMode: systemConfig.maintenanceMode,
  });
});

app.get(
  ['/api/media-history', '/media-history'],
  noStore,
  async (req: Request, res: Response): Promise<void> => {
    const limit = parseLimit(req.query.limit, 8, 24);
    const items = await getPublicMediaHistorySql(limit, systemConfig.nsfwEnabled);
    res.json({ success: true, items });
  }
);

app.post(
  ['/api/extract', '/extract'],
  maintenanceGate,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const { url, platform: requestedPlatform, preferAudio } = req.body || {};

    if (typeof url !== 'string' || !url.trim() || url.length > 4096) {
      sendError(req, res, 400, 'A valid media URL is required.', 'INVALID_URL');
      return;
    }

    const cleanUrl = url.trim();
    const detected = detectPlatform(cleanUrl);
    const platform: PlatformType =
      requestedPlatform && requestedPlatform !== 'auto' && typeof requestedPlatform === 'string'
        ? (requestedPlatform as PlatformType)
        : detected;

    if (!nsfwGateFor(platform, cleanUrl)) {
      sendError(req, res, 403, '18+ content is disabled on this deployment.', 'NSFW_DISABLED');
      return;
    }

    if (!isHttpUrl(cleanUrl)) {
      sendError(req, res, 400, 'Only http:// and https:// media links are supported.', 'INVALID_URL');
      return;
    }

    try {
      await assertSafeHttpUrl(cleanUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
    } catch (error: any) {
      sendError(req, res, 400, error.message || 'This URL is not allowed.', 'URL_BLOCKED');
      return;
    }

    const clientIp = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || 'Unknown');
    const requestId = getRequestId(req);

    const fetchUpstream = async (targetPlatform: PlatformType, isFallback = false) => {
      const targetBase = systemConfig.baseUrl;
      let upstreamUrl = '';
      let options: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(isFallback ? 12000 : 20000),
      };

      if (targetPlatform === 'youtube') {
        const endpoint = preferAudio ? 'ytmp3' : 'ytmp4';
        upstreamUrl = `${targetBase}/download/${endpoint}?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'facebook') {
        upstreamUrl = `${targetBase}/download/facebookv2`;
        options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
          },
          body: JSON.stringify({ url: cleanUrl }),
          signal: AbortSignal.timeout(isFallback ? 12000 : 20000),
        };
      } else if (targetPlatform === 'terabox') {
        upstreamUrl = `${targetBase}/download/terabox?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'xnxx') {
        upstreamUrl = `${targetBase}/nsfw/xnxx-dl?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'xvideos') {
        upstreamUrl = `${targetBase}/nsfw/xvideos-dl?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'instagram') {
        upstreamUrl = `${targetBase}/download/instagram?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'tiktok') {
        upstreamUrl = `${targetBase}/download/tiktokv2?url=${encodeURIComponent(cleanUrl)}`;
      } else if (targetPlatform === 'pinterest') {
        upstreamUrl = `${targetBase}/download/pinterestV2?url=${encodeURIComponent(cleanUrl)}`;
      } else {
        upstreamUrl = `${targetBase}/download/aiov2?url=${encodeURIComponent(cleanUrl)}`;
      }

      const response = await fetch(upstreamUrl, options);
      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      const failed =
        !response.ok ||
        !json ||
        (json.status === false && !json.data) ||
        (json.success === false && !json.data);

      if (failed) {
        const errorMessage =
          json?.error ||
          json?.message ||
          (text && !text.trim().startsWith('<') ? text.slice(0, 180) : `Upstream returned HTTP ${response.status}`);
        const error: any = new Error(errorMessage);
        error.statusCode = response.status;
        throw error;
      }

      return { json, response };
    };

    try {
      let result: { json: any; response: FetchResponse } | null = null;
      let fallbackApplied = false;
      let effectivePlatform = platform;

      try {
        result = await fetchUpstream(platform);
      } catch (primaryError: any) {
        if (platform === 'aio') throw primaryError;

        // Try the all-in-one fallback before surfacing an error.
        try {
          result = await fetchUpstream('aio', true);
          fallbackApplied = true;
          effectivePlatform = 'aio';
        } catch {
          throw primaryError;
        }
      }

      const normalized = normalizeMediaResponse(effectivePlatform, result!.json, cleanUrl);
      const hasContent =
        normalized.streams.length > 0 ||
        normalized.downloads.length > 0 ||
        Boolean(normalized.streamUrl) ||
        Boolean(normalized.galleryImages?.length) ||
        Boolean(normalized.teraboxData?.files.length);

      if (!hasContent) {
        throw new Error('The upstream gateway returned no playable formats for this URL.');
      }

      if (!normalized.title || normalized.title === 'Extracted Media') {
        normalized.title = `${effectivePlatform.toUpperCase()} media`;
      }

      void saveMediaHistorySql(normalized).catch(() => {});

      const latency = Date.now() - startTime;
      logPublicRequest(req, {
        platform: effectivePlatform,
        action: 'extract',
        input: cleanUrl,
        status: 200,
        latencyMs: latency,
        payloadSummary: `${normalized.title.slice(0, 120)} (${normalized.downloads.length} formats)`,
        requestId,
      });

      res.json({
        success: true,
        platform: effectivePlatform,
        data: normalized,
        latencyMs: latency,
        fallbackApplied,
        requestId,
      });
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const isTimeout =
        error?.name === 'TimeoutError' ||
        error?.name === 'AbortError' ||
        String(error?.message || '').toLowerCase().includes('timed out');
      const status = isTimeout ? 504 : 502;
      const message = isTimeout
        ? 'The media gateway timed out. Please try again.'
        : error.message || 'Media extraction failed.';

      logPublicRequest(req, {
        platform,
        action: 'extract',
        input: cleanUrl,
        status,
        latencyMs: latency,
        error: message,
        requestId,
      });

      sendError(req, res, status, message, isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR');
    }
  }
);

app.get(
  ['/api/search', '/search'],
  maintenanceGate,
  searchGate,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const type = String(req.query.type || 'youtube').toLowerCase();
    const query = String(req.query.q || '').trim();

    if (!query) {
      sendError(req, res, 400, 'Search query is required.', 'MISSING_QUERY');
      return;
    }
    if (query.length > 160) {
      sendError(req, res, 400, 'Search query is too long.', 'QUERY_TOO_LONG');
      return;
    }
    if (!['youtube', 'pinterest', 'xnxx', 'xvideos'].includes(type)) {
      sendError(req, res, 400, 'Unsupported search engine.', 'INVALID_TYPE');
      return;
    }
    if ((type === 'xnxx' || type === 'xvideos') && !systemConfig.nsfwEnabled) {
      sendError(req, res, 403, '18+ content is disabled on this deployment.', 'NSFW_DISABLED');
      return;
    }

    try {
      const targetBase = systemConfig.baseUrl;
      let endpoint = `${targetBase}/search/youtube?q=${encodeURIComponent(query)}`;
      if (type === 'pinterest') endpoint = `${targetBase}/search/pinterest?q=${encodeURIComponent(query)}`;
      else if (type === 'xnxx') endpoint = `${targetBase}/nsfw/xnxx-search?query=${encodeURIComponent(query)}`;
      else if (type === 'xvideos') endpoint = `${targetBase}/nsfw/xvideos-search?query=${encodeURIComponent(query)}`;

      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!response.ok || !json) {
        throw new Error(json?.error || `Search gateway returned HTTP ${response.status}`);
      }

      const rawList: unknown[] = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.videos)
          ? json.videos
          : Array.isArray(json.results)
            ? json.results
            : Array.isArray(json)
              ? json
              : [];

      const normalized = normalizeSearchResults(type, rawList);

      if ((type === 'xnxx' || type === 'xvideos') && systemConfig.nsfwEnabled) {
        await Promise.allSettled(
          normalized.slice(0, 16).map(async item => {
            const thumb = String(item.thumbnail || '');
            const link = String(item.link || '');
            if (!thumb || thumb.includes('blank.gif') || thumb.length < 12) {
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
        action: 'search',
        input: query,
        status: 200,
        latencyMs: latency,
        payloadSummary: `${normalized.length} results`,
      });

      res.json({
        success: true,
        type,
        query,
        data: normalized,
        count: normalized.length,
        latencyMs: latency,
      });
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      logPublicRequest(req, {
        platform: type,
        action: 'search',
        input: query,
        status: isTimeout ? 504 : 502,
        latencyMs: latency,
        error: error.message,
      });
      sendError(
        req,
        res,
        isTimeout ? 504 : 502,
        isTimeout ? 'Search timed out. Please try again.' : error.message || 'Search failed.',
        isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR'
      );
    }
  }
);

app.get(
  ['/api/youtube-transcript', '/youtube-transcript'],
  maintenanceGate,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || targetUrl.length > 2048 || detectPlatform(targetUrl) !== 'youtube') {
      sendError(req, res, 400, 'A valid YouTube URL is required.', 'INVALID_URL');
      return;
    }

    try {
      const endpoint = `${systemConfig.baseUrl}/tools/youtube-transcript?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) {
        throw new Error(json?.error || `Transcript gateway returned HTTP ${response.status}`);
      }

      const data = json.data || json;
      let transcript = data.transcript || data.captions || data.subtitles || [];
      if (!Array.isArray(transcript) && Array.isArray(data.data)) transcript = data.data;

      const normalizedTranscript = (Array.isArray(transcript) ? transcript : [])
        .map((item: any) => {
          if (typeof item === 'string') return { text: item, start: 0, duration: 0 };
          return {
            text: String(item.text || item.content || item.caption || ''),
            start: Number(item.start ?? item.offset ?? item.from ?? 0) || 0,
            duration: Number(item.duration ?? item.dur ?? 0) || 0,
          };
        })
        .filter(item => item.text);

      if (normalizedTranscript.length === 0) {
        throw new Error('No transcript is available for this video.');
      }

      void recordLogSql({
        platform: 'youtube',
        action: 'extract',
        input: targetUrl,
        status: 200,
        latencyMs: 0,
        clientIp: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'Unknown'),
        payloadSummary: `${normalizedTranscript.length} transcript lines`,
        requestId: getRequestId(req),
      }).catch(() => {});

      res.json({ success: true, data: { transcript: normalizedTranscript } });
    } catch (error: any) {
      sendError(req, res, 502, error.message || 'Transcript extraction failed.', 'UPSTREAM_ERROR');
    }
  }
);

app.get(
  ['/api/proxy-image', '/proxy-image'],
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const imageUrl = String(req.query.url || '');
    if (!imageUrl || imageUrl.length > 4096) {
      sendError(req, res, 400, 'Missing or invalid image URL.');
      return;
    }

    try {
      const upstream = await safeFetch(
        imageUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        },
        { allowPrivate: ALLOW_PRIVATE_PROXY }
      );

      if (!upstream.ok) {
        res.redirect(302, imageUrl);
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.toLowerCase().startsWith('image/')) {
        sendError(req, res, 415, 'The remote resource is not an image.');
        return;
      }

      const contentLength = Number(upstream.headers.get('content-length') || 0);
      if (contentLength > 12 * 1024 * 1024) {
        sendError(req, res, 413, 'Image is too large to proxy.');
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.byteLength > 12 * 1024 * 1024) {
        sendError(req, res, 413, 'Image is too large to proxy.');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=43200');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(buffer);
    } catch (error: any) {
      sendError(req, res, 502, error.message || 'Image proxy failed.');
    }
  }
);

app.get(
  ['/api/proxy-stream', '/proxy-stream'],
  maintenanceGate,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || targetUrl.length > 8192) {
      sendError(req, res, 400, 'Missing or invalid media URL.');
      return;
    }

    const startTime = Date.now();
    let validated = false;
    let aborted = false;
    const controller = new AbortController();
    const headerTimeout = setTimeout(() => controller.abort(), 25_000);

    const abortOnClose = () => {
      if (!res.writableEnded) {
        aborted = true;
        controller.abort();
      }
    };
    req.on('aborted', abortOnClose);
    res.on('close', abortOnClose);

    try {
      await assertSafeHttpUrl(targetUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
      validated = true;

      const range = req.headers.range;
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: '*/*',
      };
      if (range) headers.Range = range;
      try {
        headers.Referer = `${new URL(targetUrl).origin}/`;
      } catch {
        // ignore
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

      const contentType = upstream.headers.get('content-type') || 'video/mp4';
      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);

      logPublicRequest(req, {
        platform: detectPlatform(targetUrl),
        action: 'stream',
        input: targetUrl,
        status: upstream.status,
        latencyMs: Date.now() - startTime,
        payloadSummary: contentType,
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      await pipeline(Readable.fromWeb(upstream.body as any), res);
    } catch (error: any) {
      clearTimeout(headerTimeout);
      if (aborted || res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (validated) {
        // Let the browser talk to the CDN directly if our proxy cannot reach it.
        res.redirect(302, targetUrl);
        return;
      }
      sendError(req, res, 502, error.message || 'Media proxy failed.', 'PROXY_ERROR');
    } finally {
      clearTimeout(headerTimeout);
      req.off('aborted', abortOnClose);
      res.off('close', abortOnClose);
    }
  }
);

app.get(
  ['/api/proxy-download', '/proxy-download'],
  maintenanceGate,
  downloadsGate,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const targetUrl = String(req.query.url || '');
    const requestedFilename = String(req.query.filename || `streampulse_${Date.now()}.mp4`);
    if (!targetUrl || targetUrl.length > 8192) {
      sendError(req, res, 400, 'Missing or invalid download URL.');
      return;
    }

    const startTime = Date.now();
    let validated = false;
    const controller = new AbortController();
    const headerTimeout = setTimeout(() => controller.abort(), 25_000);

    try {
      await assertSafeHttpUrl(targetUrl, { allowPrivate: ALLOW_PRIVATE_PROXY });
      validated = true;

      const upstream = await safeFetch(
        targetUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: '*/*',
            ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
          },
          signal: controller.signal,
        },
        { allowPrivate: ALLOW_PRIVATE_PROXY }
      );
      clearTimeout(headerTimeout);

      if (!upstream.ok && upstream.status !== 206) {
        throw new Error(`Upstream file responded with HTTP ${upstream.status}`);
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', buildContentDisposition(requestedFilename));
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      logPublicRequest(req, {
        platform: detectPlatform(targetUrl),
        action: 'download',
        input: targetUrl,
        status: upstream.status,
        latencyMs: Date.now() - startTime,
        payloadSummary: `${sanitizeFilename(requestedFilename)} (${contentType})`,
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      await pipeline(Readable.fromWeb(upstream.body as any), res);
    } catch (error: any) {
      clearTimeout(headerTimeout);
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (validated) {
        res.redirect(302, targetUrl);
        return;
      }
      sendError(req, res, 502, error.message || 'Download proxy failed.', 'PROXY_ERROR');
    } finally {
      clearTimeout(headerTimeout);
    }
  }
);

/* ==========================================================================
   ADMIN AUTHENTICATION
   ========================================================================== */

app.post('/api/admin/login', noStore, async (req: Request, res: Response): Promise<void> => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length > 256) {
    sendError(req, res, 400, 'Password is required.', 'INVALID_REQUEST');
    return;
  }

  const clientIp = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || 'Unknown').slice(0, 400);

  try {
    const session = await adminAuth.login(password, clientIp, userAgent);
    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: 'Admin authenticated successfully',
      status: 200,
      latencyMs: 1,
      payloadSummary: 'New admin session issued',
    });

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      sessionTtlHours: adminAuth.sessionTtl,
    });
  } catch (error: any) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: 'Failed admin login attempt',
      status,
      latencyMs: 1,
      error: error.message,
    });
    sendError(req, res, status, error.message || 'Login failed.', 'AUTH_FAILED');
  }
});

app.get('/api/admin/session', requireAdmin, (req: Request, res: Response): void => {
  const admin = (req as AuthedRequest).admin!;
  res.json({
    success: true,
    session: { id: admin.sid, expiresAt: admin.expiresAt },
    sessionTtlHours: adminAuth.sessionTtl,
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
  });
});

app.post('/api/admin/logout', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const token = (req as AuthedRequest).adminToken || '';
  await adminAuth.logout(token);
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: 'Admin session logged out',
    status: 200,
    latencyMs: 1,
  });
  res.json({ success: true });
});

/* ==========================================================================
   ADMIN TELEMETRY & ANALYTICS
   ========================================================================== */

app.get('/api/admin/stats', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const sqlStats = await getAdminStatsSql();
  const useMemory = sqlStats.totalRequests === 0 && memoryStats.totalRequests > 0;

  const merged: AdminStats = {
    ...(useMemory ? memoryStats : sqlStats),
    totalRequests: Math.max(sqlStats.totalRequests, memoryStats.totalRequests),
    successfulRequests: Math.max(sqlStats.successfulRequests, memoryStats.successfulRequests),
    failedRequests: Math.max(sqlStats.failedRequests, memoryStats.failedRequests),
    totalStreams: Math.max(sqlStats.totalStreams, memoryStats.totalStreams),
    totalDownloads: Math.max(sqlStats.totalDownloads, memoryStats.totalDownloads),
    averageLatencyMs: sqlStats.averageLatencyMs || memoryStats.averageLatencyMs,
  };

  const diagnostics = await buildDiagnostics();
  merged.uptimeSeconds = diagnostics.uptimeSeconds;
  merged.memoryUsageMB = diagnostics.memoryUsageMB;
  merged.diagnostics = diagnostics;

  res.json({ success: true, stats: merged, runtime: getRuntimeInfo() });
});

app.get('/api/admin/analytics', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const hours = parseLimit(req.query.hours, 24, 720);
  const [series, top, recentErrors] = await Promise.all([
    getAnalyticsSeriesSql(hours),
    getTopAnalyticsSql(),
    queryLogsSql({ status: 'error', limit: 10 }),
  ]);

  res.json({
    success: true,
    hours,
    series,
    ...top,
    recentErrors: recentErrors.logs,
  });
});

app.get('/api/admin/logs', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const filters = {
    platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    limit: parseLimit(req.query.limit, 100, 1000),
    offset: Math.max(Number(req.query.offset) || 0, 0),
  };

  const data = await queryLogsSql(filters);
  let logs = data.logs;
  let total = data.total;

  // In-memory fallback if the SQLite query failed completely.
  if (total === 0 && logs.length === 0 && auditLogs.length > 0) {
    const filtered = auditLogs.filter(log => {
      if (filters.platform && filters.platform !== 'all' && log.platform.toLowerCase() !== filters.platform.toLowerCase()) return false;
      if (filters.action && filters.action !== 'all' && log.action.toLowerCase() !== filters.action.toLowerCase()) return false;
      if (filters.status === 'success' && log.status >= 400) return false;
      if (filters.status === 'error' && log.status < 400) return false;
      if (filters.q && !`${log.input} ${log.error || ''} ${log.payloadSummary || ''}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    });
    total = filtered.length;
    logs = filtered.slice(filters.offset, filters.offset + filters.limit) as LogEntry[];
  }

  res.json({ success: true, total, limit: filters.limit, offset: filters.offset, logs });
});

app.delete('/api/admin/logs/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const deleted = await deleteLogSql(String(req.params.id));
  const index = auditLogs.findIndex(log => log.id === req.params.id);
  if (index >= 0) auditLogs.splice(index, 1);
  res.json({ success: true, deleted });
});

app.delete('/api/admin/logs', requireAdmin, (req: Request, res: Response): void => {
  void (async () => {
    await clearLogsSql();
    auditLogs.length = 0;
    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: 'Audit logs cleared by administrator',
      status: 200,
      latencyMs: 1,
    });
    res.json({ success: true });
  })();
});

app.post('/api/admin/logs/prune', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const days = parseLimit(req.body?.days, 30, 3650);
  const deleted = await deleteOldLogsSql(days);
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: `Pruned audit logs older than ${days} day(s)`,
    status: 200,
    latencyMs: 1,
    payloadSummary: `${deleted} rows removed`,
  });
  res.json({ success: true, deleted, days });
});

app.get('/api/admin/media', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const data = await queryMediaHistorySql({
    q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined,
    platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
    limit: parseLimit(req.query.limit, 50, 200),
    offset: Math.max(Number(req.query.offset) || 0, 0),
  });
  res.json({ success: true, ...data });
});

app.delete('/api/admin/media/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const deleted = await deleteMediaHistorySql(String(req.params.id));
  res.json({ success: true, deleted });
});

app.delete('/api/admin/media', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await clearMediaHistorySql();
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: 'Media history cleared by administrator',
    status: 200,
    latencyMs: 1,
  });
  res.json({ success: true });
});

/* ==========================================================================
   ADMIN SYSTEM CONFIG
   ========================================================================== */

app.get('/api/admin/config', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const saved = await getSystemConfigSql();
  Object.assign(systemConfig, saved);
  res.json({
    success: true,
    config: systemConfig,
    runtime: getRuntimeInfo(),
  });
});

app.post('/api/admin/config', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  const updates: Partial<SystemConfig> = {};

  try {
    if (body.baseUrl !== undefined) {
      updates.baseUrl = validateConfiguredBaseUrl(body.baseUrl);
    }
    if (body.announcement !== undefined) {
      const text = String(body.announcement).trim();
      if (text.length > 300) throw new Error('Announcement must be 300 characters or fewer');
      updates.announcement = text;
    }
    if (body.announcementActive !== undefined) {
      if (typeof body.announcementActive !== 'boolean') throw new Error('announcementActive must be a boolean');
      updates.announcementActive = body.announcementActive;
    }
    if (body.announcementLevel !== undefined) {
      if (!['info', 'success', 'warning', 'critical'].includes(body.announcementLevel)) {
        throw new Error('Invalid announcement level');
      }
      updates.announcementLevel = body.announcementLevel;
    }
    if (body.rateLimitEnabled !== undefined) {
      if (typeof body.rateLimitEnabled !== 'boolean') throw new Error('rateLimitEnabled must be a boolean');
      updates.rateLimitEnabled = body.rateLimitEnabled;
    }
    if (body.rateLimitRpm !== undefined) {
      const rpm = Number(body.rateLimitRpm);
      if (!Number.isFinite(rpm)) throw new Error('rateLimitRpm must be a number');
      updates.rateLimitRpm = clamp(Math.round(rpm), 5, 600);
    }
    if (body.maintenanceMode !== undefined) {
      if (typeof body.maintenanceMode !== 'boolean') throw new Error('maintenanceMode must be a boolean');
      updates.maintenanceMode = body.maintenanceMode;
    }
    if (body.nsfwEnabled !== undefined) {
      if (typeof body.nsfwEnabled !== 'boolean') throw new Error('nsfwEnabled must be a boolean');
      updates.nsfwEnabled = body.nsfwEnabled;
    }
    if (body.searchEnabled !== undefined) {
      if (typeof body.searchEnabled !== 'boolean') throw new Error('searchEnabled must be a boolean');
      updates.searchEnabled = body.searchEnabled;
    }
    if (body.downloadsEnabled !== undefined) {
      if (typeof body.downloadsEnabled !== 'boolean') throw new Error('downloadsEnabled must be a boolean');
      updates.downloadsEnabled = body.downloadsEnabled;
    }
  } catch (error: any) {
    sendError(req, res, 400, error.message || 'Invalid configuration.', 'INVALID_CONFIG');
    return;
  }

  await updateSystemConfigSql(updates);
  Object.assign(systemConfig, updates);

  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: 'System configuration updated',
    status: 200,
    latencyMs: 1,
    payloadSummary: `Maintenance=${systemConfig.maintenanceMode}, RateLimit=${systemConfig.rateLimitEnabled}, NSFW=${systemConfig.nsfwEnabled}`,
  });

  res.json({ success: true, config: systemConfig, runtime: getRuntimeInfo() });
});

/* ==========================================================================
   ADMIN HEALTH, SANDBOX & DATABASE
   ========================================================================== */

app.get('/api/admin/health', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const single = typeof req.query.endpoint === 'string' ? req.query.endpoint.toLowerCase() : '';
  let endpoints = getHealthEndpoints();
  if (single) endpoints = endpoints.filter(endpoint => endpoint.name.toLowerCase().includes(single));

  const results: EndpointHealth[] = await Promise.all(
    endpoints.map(async endpoint => {
      const started = Date.now();
      if (endpoint.nsfw && !systemConfig.nsfwEnabled) {
        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: 'disabled',
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
        };
      }

      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'User-Agent': `${APP_NAME}-Health-Probe/1.0`,
            'Content-Type': 'application/json',
          },
          body: endpoint.method === 'POST' ? JSON.stringify((endpoint as any).body || {}) : undefined,
          signal: AbortSignal.timeout(8000),
        });

        const sample = await readResponseSample(response, 700);
        const latency = Date.now() - started;

        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: response.status < 500 ? 'online' : 'degraded',
          latencyMs: latency,
          statusCode: response.status,
          lastChecked: new Date().toISOString(),
          sampleResponse: sample.text.slice(0, 700),
          contentType: response.headers.get('content-type') || undefined,
        };
      } catch {
        return {
          endpoint: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          status: 'offline',
          latencyMs: Date.now() - started,
          statusCode: 0,
          lastChecked: new Date().toISOString(),
        };
      }
    })
  );

  res.json({ success: true, timestamp: new Date().toISOString(), endpoints: results });
});

app.post('/api/admin/test-endpoint', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { url, method = 'GET', body, headers = {} } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    sendError(req, res, 400, 'Endpoint URL is required.', 'INVALID_URL');
    return;
  }

  const upperMethod = String(method).toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) {
    sendError(req, res, 400, 'Unsupported HTTP method.', 'INVALID_METHOD');
    return;
  }

  const safeHeaders: Record<string, string> = {};
  const blockedHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade']);
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string' || blockedHeaders.has(key.toLowerCase())) continue;
      safeHeaders[key] = value.slice(0, 2000);
    }
  }

  const started = Date.now();
  try {
    await assertSafeHttpUrl(url, {
      allowPrivate: ALLOW_PRIVATE_PROXY || !IS_PRODUCTION,
    });

    const init: RequestInit = {
      method: upperMethod,
      headers: {
        'User-Agent': `${APP_NAME}-Admin-Sandbox/1.0`,
        Accept: 'application/json, text/plain, */*',
        ...safeHeaders,
      },
      signal: AbortSignal.timeout(20000),
    };

    if (!['GET', 'HEAD'].includes(upperMethod) && body !== undefined) {
      if (typeof body === 'string') {
        init.body = body;
      } else {
        init.body = JSON.stringify(body);
        if (!Object.keys(safeHeaders).some(key => key.toLowerCase() === 'content-type')) {
          (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await safeFetch(url, init, {
      allowPrivate: ALLOW_PRIVATE_PROXY || !IS_PRODUCTION,
    });
    const latency = Date.now() - started;
    const contentType = response.headers.get('content-type') || '';
    const sample = await readResponseSample(response, 200_000);

    let data: unknown = sample.text;
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(sample.text);
      } catch {
        data = sample.text;
      }
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: `Sandbox ${upperMethod} ${url}`.slice(0, 600),
      status: 200,
      latencyMs: latency,
      payloadSummary: `HTTP ${response.status}, ${sample.bytes} bytes`,
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
      requestId: getRequestId(req),
    });
  } catch (error: any) {
    sendError(req, res, 502, error.message || 'Request failed.', 'SANDBOX_ERROR');
  }
});

app.get('/api/admin/database/download', requireAdmin, (req: Request, res: Response): void => {
  if (isRemoteDatabase()) {
    sendError(
      req,
      res,
      409,
      'This deployment uses a remote libSQL/Turso database. Use the JSON snapshot export or the Turso dashboard instead.',
      'REMOTE_DATABASE'
    );
    return;
  }

  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    sendError(req, res, 404, 'Database file not found on disk yet.', 'NOT_FOUND');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `streampulse_backup_${timestamp}.db`;
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: `Downloaded SQLite backup (${filename})`,
    status: 200,
    latencyMs: 1,
  });

  res.download(dbPath, filename, error => {
    if (error && !res.headersSent) {
      sendError(req, res, 500, 'Failed to send database file.', 'DOWNLOAD_FAILED');
    }
  });
});

app.get('/api/admin/database/export', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const snapshot = await exportDatabaseSnapshotSql();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = JSON.stringify(snapshot, null, 2);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    buildContentDisposition(`streampulse_snapshot_${timestamp}.json`)
  );
  res.send(payload);
});

app.post('/api/admin/database/optimize', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  if (isRemoteDatabase()) {
    sendError(req, res, 409, 'Optimization is only available for local SQLite deployments.', 'REMOTE_DATABASE');
    return;
  }
  try {
    const db = await initDatabase();
    await db.execute('PRAGMA optimize');
    await db.execute('VACUUM');
    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: 'SQLite database optimized (PRAGMA optimize + VACUUM)',
      status: 200,
      latencyMs: 1,
    });
    res.json({ success: true });
  } catch (error: any) {
    sendError(req, res, 500, error.message || 'Database optimization failed.', 'DB_ERROR');
  }
});

app.post('/api/admin/reset-stats', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
    platform: 'system',
    action: 'admin',
    input: 'Telemetry counters reset',
    status: 200,
    latencyMs: 1,
  });
  res.json({ success: true });
});

/* ==========================================================================
   ADMIN SECURITY
   ========================================================================== */

app.post('/api/admin/change-password', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    sendError(req, res, 400, 'currentPassword and newPassword are required.', 'INVALID_REQUEST');
    return;
  }

  try {
    await adminAuth.changePassword(
      currentPassword,
      newPassword,
      (req as AuthedRequest).admin!.sid
    );
    logPublicRequest(req, {
      platform: 'system',
      action: 'admin',
      input: 'Admin password changed',
      status: 200,
      latencyMs: 1,
    });
    res.json({ success: true, message: 'Password updated. Other admin sessions were revoked.' });
  } catch (error: any) {
    sendError(
      req,
      res,
      error instanceof AuthError ? error.statusCode : 400,
      error.message || 'Could not update the password.',
      'PASSWORD_ERROR'
    );
  }
});

app.get('/api/admin/sessions', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const currentSid = (req as AuthedRequest).admin!.sid;
  const sessions = await adminAuth.listSessions(currentSid);
  res.json({ success: true, sessions, currentSessionId: currentSid });
});

app.delete('/api/admin/sessions/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await adminAuth.revokeSession(String(req.params.id), (req as AuthedRequest).admin!.sid);
    res.json({ success: true });
  } catch (error: any) {
    sendError(req, res, error instanceof AuthError ? error.statusCode : 400, error.message);
  }
});

app.post('/api/admin/sessions/revoke-others', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await adminAuth.revokeOtherSessions((req as AuthedRequest).admin!.sid);
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: 'All other admin sessions revoked',
    status: 200,
    latencyMs: 1,
  });
  res.json({ success: true });
});

app.get('/api/admin/security/ips', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const ips = await listBlockedIpsSql();
  res.json({ success: true, ips, currentIp: getClientIp(req) });
});

app.post('/api/admin/security/ips', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const rawIp = String(req.body?.ip || '').trim();
  const ip = rawIp.replace(/^\[|\]$/g, '');
  if (!net.isIP(ip)) {
    sendError(req, res, 400, 'Enter a valid IPv4 or IPv6 address.', 'INVALID_IP');
    return;
  }
  if (ip === getClientIp(req)) {
    sendError(req, res, 400, 'You cannot block the IP address you are currently using.', 'SELF_BLOCK');
    return;
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : '';
  await addBlockedIpSql(ip, reason);
  blockedIps.add(ip);
  logPublicRequest(req, {
    platform: 'system',
    action: 'admin',
    input: `Blocked IP ${ip}`,
    status: 200,
    latencyMs: 1,
    payloadSummary: reason,
  });
  res.json({ success: true, ip });
});

app.delete('/api/admin/security/ips/:ip', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const ip = String(req.params.ip || '').replace(/^\[|\]$/g, '');
  const removed = await removeBlockedIpSql(ip);
  blockedIps.delete(ip);
  res.json({ success: true, removed });
});

/* ==========================================================================
   FALLBACKS, STATIC FILES & STARTUP
   ========================================================================== */

app.use('/api', (req: Request, res: Response): void => {
  sendError(req, res, 404, `No API route matches ${req.method} ${req.originalUrl}.`, 'NOT_FOUND');
});

app.use((error: any, req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    sendError(req, res, 400, 'Malformed JSON request body.', 'BAD_JSON');
    return;
  }
  if (error?.type === 'entity.too.large') {
    sendError(req, res, 413, 'Request body is too large.', 'PAYLOAD_TOO_LARGE');
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  sendError(req, res, 500, 'Internal server error. Check the server logs for details.', 'INTERNAL_ERROR');
});

async function startServer(): Promise<void> {
  await initializeApp();

  if (!IS_PRODUCTION && fs.existsSync(path.resolve(__dirname, 'src'))) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[boot] Vite dev middleware enabled');
  } else if (!IS_VERCEL) {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.includes(`${path.sep}assets${path.sep}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache');
            }
          },
        })
      );
      app.get('*', (_req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      console.log(`[boot] Serving static client from ${distPath}`);
    } else {
      console.warn('[boot] dist/ not found. Run "npm run build" before starting in production.');
    }
  }

  httpServer = app.listen(PORT, HOST, () => {
    console.log(`> ${APP_NAME} v${APP_VERSION} running at http://${HOST}:${PORT}`);
    console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`> Admin session TTL: ${adminAuth.sessionTtl}h`);
  });

  // Video streams and downloads can legitimately run for a long time.
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 60_000;

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] Received ${signal}. Closing connections...`);
    httpServer?.close();
    await closeDatabase().catch(() => {});
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (!IS_VERCEL) {
  startServer().catch(error => {
    console.error('Failed to start StreamPulse:', error);
    process.exit(1);
  });
}

export default app;
export { app };
