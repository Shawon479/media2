/**
 * Universal media & admin system types.
 */

export type PlatformType =
  | 'auto'
  | 'youtube'
  | 'terabox'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'pinterest'
  | 'xnxx'
  | 'xvideos'
  | 'aio';

export type MediaType = 'video' | 'audio' | 'image' | 'gallery' | 'folder';

export type AnnouncementLevel = 'info' | 'success' | 'warning' | 'critical';

export interface MediaFormat {
  id: string;
  label: string;
  quality?: string;
  resolution?: string;
  extension: string;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  url: string;
  directStreamable?: boolean;
  fps?: number;
  formatNote?: string;
}

export interface TeraboxFile {
  fsId: number | string;
  filename: string;
  path: string;
  sizeBytes: number;
  sizeFormatted: string;
  category: 'video' | 'photo' | 'document' | 'other';
  thumbnail?: string;
  streamUrl?: string;
  md5?: string;
}

export interface UniversalMediaItem {
  id: string;
  title: string;
  platform: PlatformType;
  sourceUrl: string;
  thumbnail?: string;
  author?: string;
  channelUrl?: string;
  duration?: string;
  durationSeconds?: number;
  views?: string | number;
  likes?: string | number;
  uploadDate?: string;
  mediaType: MediaType;
  streamUrl?: string;
  streams: MediaFormat[];
  downloads: MediaFormat[];
  description?: string;
  teraboxData?: {
    shareId: number | string;
    rootPath: string;
    totals: { items: number; folders: number; videos: number; photos: number };
    files: TeraboxFile[];
  };
  galleryImages?: string[];
  raw?: unknown;
}

export interface SearchResultItem {
  id: string;
  type: 'youtube' | 'pinterest';
  title: string;
  channel?: string;
  duration?: string;
  imageUrl: string;
  link: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  platform: string;
  action: 'extract' | 'stream' | 'download' | 'search' | 'admin';
  input: string;
  status: number;
  latencyMs: number;
  clientIp?: string;
  userAgent?: string;
  error?: string;
  payloadSummary?: string;
  requestId?: string;
}

export interface DatabaseDiagnostics {
  connected: boolean;
  type: string;
  path: string;
  fileSizeBytes: number;
  totalLogs: number;
  totalMediaHistory: number;
  remote?: boolean;
}

export interface ServerDiagnostics {
  uptimeSeconds: number;
  uptimeFormatted: string;
  memoryUsageMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  nodeVersion: string;
  platform: string;
  arch: string;
  environment: string;
  version: string;
  pid: number;
  startedAt: string;
  activeSessions: number;
  cachedLogsCount: number;
  database?: DatabaseDiagnostics;
}

export interface AdminStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalStreams: number;
  totalDownloads: number;
  averageLatencyMs: number;
  platformBreakdown: Record<string, number>;
  actionBreakdown: Record<string, number>;
  recentErrorsCount: number;
  uniqueClients?: number;
  requestsLast24h?: number;
  errorRate?: number;
  uptimeSeconds?: number;
  memoryUsageMB?: number;
  diagnostics?: ServerDiagnostics;
}

export interface EndpointHealth {
  endpoint: string;
  url?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  status: 'online' | 'degraded' | 'offline' | 'checking' | 'disabled';
  latencyMs: number;
  statusCode?: number;
  lastChecked?: string;
  sampleResponse?: string;
  contentType?: string;
}

export interface SystemConfig {
  baseUrl: string;
  announcement: string;
  announcementActive: boolean;
  announcementLevel: AnnouncementLevel;
  rateLimitEnabled: boolean;
  rateLimitRpm: number;
  maintenanceMode: boolean;
  /** Enables 18+ platform tabs, extraction and search. */
  nsfwEnabled: boolean;
  /** Enables the public search hub. */
  searchEnabled: boolean;
  /** Enables proxied/direct download actions. */
  downloadsEnabled: boolean;
}

export interface PublicConfig {
  appName: string;
  version: string;
  maintenanceMode: boolean;
  announcementActive: boolean;
  announcement: string;
  announcementLevel: AnnouncementLevel;
  nsfwEnabled: boolean;
  searchEnabled: boolean;
  downloadsEnabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitRpm: number;
}

export interface MediaHistoryEntry {
  id: string;
  url: string;
  platform: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  author?: string;
  mediaType?: string;
  downloads: MediaFormat[];
  createdAt: string;
}

export interface AnalyticsPoint {
  label: string;
  requests: number;
  errors: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface AdminAnalytics {
  series: AnalyticsPoint[];
  topPlatforms: NamedCount[];
  topActions: NamedCount[];
  topInputs: NamedCount[];
  topClients: NamedCount[];
  recentErrors: LogEntry[];
  mediaSummary: NamedCount[];
}

export interface AdminSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  clientIp?: string;
  userAgent?: string;
  current?: boolean;
}

export interface BlockedIp {
  ip: string;
  reason?: string;
  createdAt: string;
}

export interface AdminBootstrap {
  stats: AdminStats;
  config: SystemConfig;
  runtime: {
    environment: string;
    version: string;
    nodeVersion: string;
    remoteDatabase: boolean;
    adminPasswordConfigured: boolean;
    sessionTtlHours: number;
    publicUrl?: string;
  };
}

export interface AdminRuntimeInfo {
  environment: string;
  version: string;
  nodeVersion: string;
  remoteDatabase: boolean;
  adminPasswordConfigured: boolean;
  sessionTtlHours: number;
  publicUrl?: string;
}

export type AdminTab =
  | 'overview'
  | 'analytics'
  | 'logs'
  | 'media'
  | 'health'
  | 'sandbox'
  | 'api'
  | 'security'
  | 'settings';

