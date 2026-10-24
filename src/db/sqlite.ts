import { createClient, type Client } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  AdminSession,
  AdminStats,
  AnalyticsPoint,
  BlockedIp,
  LogEntry,
  MediaHistoryEntry,
  NamedCount,
  SystemConfig,
  UniversalMediaItem,
} from '../types';

let dbClient: Client | null = null;
let initPromise: Promise<Client> | null = null;
let databaseInfo = {
  url: '',
  remote: false,
  displayPath: '',
};

const DEFAULT_DB_FILENAME = 'streampulse.db';

function resolveDatabaseTarget(): { url: string; authToken?: string; remote: boolean; displayPath: string } {
  const explicitUrl = (process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '').trim();
  const authToken = (process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '').trim() || undefined;

  if (explicitUrl) {
    if (explicitUrl.startsWith('file:')) {
      const filePath = explicitUrl.slice('file:'.length).replace(/^\/+/, process.platform === 'win32' ? '' : '/');
      const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      return {
        url: `file:${absolute.replace(/\\/g, '/')}`,
        remote: false,
        displayPath: absolute,
      };
    }

    if (/^(libsql|https?|wss?):\/\//i.test(explicitUrl)) {
      let displayPath = explicitUrl;
      try {
        const parsed = new URL(explicitUrl);
        displayPath = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        displayPath = explicitUrl.replace(/\/\/.*@/, '//');
      }
      return { url: explicitUrl, authToken, remote: true, displayPath };
    }

    throw new Error('DATABASE_URL must start with file:, libsql://, https:// or wss://');
  }

  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), 'data');
  const filePath = path.join(dataDir, DEFAULT_DB_FILENAME);
  return {
    url: `file:${filePath.replace(/\\/g, '/')}`,
    remote: false,
    displayPath: filePath,
  };
}

async function ensureColumn(db: Client, table: string, column: string, definition: string): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some(row => String(row.name).toLowerCase() === column.toLowerCase());
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function createSchema(db: Client): Promise<void> {
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

  await ensureColumn(db, 'audit_logs', 'request_id', 'TEXT');

  await db.execute('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON audit_logs (timestamp DESC)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_logs_platform ON audit_logs (platform)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_logs_action ON audit_logs (action)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_logs_status ON audit_logs (status)');

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

  await ensureColumn(db, 'media_history', 'author', 'TEXT');
  await ensureColumn(db, 'media_history', 'media_type', 'TEXT');

  await db.execute('CREATE INDEX IF NOT EXISTS idx_media_created ON media_history (created_at DESC)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_media_url ON media_history (url)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_media_platform ON media_history (platform)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS telemetry_counters (
      counter_name TEXT PRIMARY KEY,
      counter_value INTEGER NOT NULL DEFAULT 0
    )
  `);

  const counters = [
    'totalRequests',
    'successfulRequests',
    'failedRequests',
    'totalStreams',
    'totalDownloads',
  ];
  for (const name of counters) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO telemetry_counters (counter_name, counter_value) VALUES (?, 0)',
      args: [name],
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
  await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions (expires_at)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

async function seedDefaults(db: Client): Promise<void> {
  const now = new Date().toISOString();
  const defaults: Record<string, string> = {
    baseUrl: (process.env.PREXZY_API_BASE_URL || 'https://prexzyapis.com').replace(/\/+$/, ''),
    announcement: 'StreamPulse is online — fast HD streaming, Terabox cloud playback and MP3 extraction.',
    announcementActive: 'true',
    announcementLevel: 'info',
    rateLimitEnabled: 'false',
    rateLimitRpm: '60',
    maintenanceMode: 'false',
    nsfwEnabled: process.env.NSFW_ENABLED === 'false' ? 'false' : 'true',
    searchEnabled: 'true',
    downloadsEnabled: 'true',
    adminSessionVersion: '1',
    sessionSecret: crypto.randomBytes(48).toString('base64url'),
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)',
      args: [key, value, now],
    });
  }
}

export async function initDatabase(): Promise<Client> {
  if (dbClient) return dbClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const target = resolveDatabaseTarget();
    databaseInfo = {
      url: target.url,
      remote: target.remote,
      displayPath: target.displayPath,
    };

    try {
      if (!target.remote) {
        const filePath = target.displayPath;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }

      const client = createClient({
        url: target.url,
        authToken: target.authToken,
      });

      await createSchema(client);
      await seedDefaults(client);

      if (!target.remote) {
        try {
          await client.execute('PRAGMA journal_mode = WAL');
          await client.execute('PRAGMA busy_timeout = 5000');
        } catch {
          // Pragmas are best-effort (remote libSQL ignores them).
        }
      }

      dbClient = client;
      console.log(`[db] Connected to ${target.remote ? 'remote libSQL' : 'local SQLite'} at ${target.displayPath}`);
      return client;
    } catch (error) {
      console.error('[db] Database initialization failed:', error);
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MEMORY_DB !== 'true') {
        throw new Error(
          'Database unavailable. Set DATABASE_URL / DATABASE_AUTH_TOKEN, or ALLOW_MEMORY_DB=true for an ephemeral demo instance.'
        );
      }

      console.warn('[db] Falling back to an ephemeral in-memory database. Data will be lost on restart.');
      const memory = createClient({ url: ':memory:' });
      await createSchema(memory);
      await seedDefaults(memory);
      dbClient = memory;
      databaseInfo = {
        url: ':memory:',
        remote: false,
        displayPath: ':memory: (ephemeral)',
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

async function getDb(): Promise<Client> {
  return dbClient ?? initDatabase();
}

export function getDatabasePath(): string {
  if (!databaseInfo.displayPath) {
    try {
      const target = resolveDatabaseTarget();
      return target.displayPath;
    } catch {
      return 'unknown';
    }
  }
  return databaseInfo.displayPath;
}

export function isRemoteDatabase(): boolean {
  return databaseInfo.remote;
}

export async function closeDatabase(): Promise<void> {
  if (!dbClient) return;
  try {
    dbClient.close();
  } catch {
    // ignore close failures
  }
  dbClient = null;
}

/* ==========================================================================
   GENERIC CONFIG
   ========================================================================== */

export async function getConfigValueSql(key: string): Promise<string | null> {
  const db = await getDb();
  try {
    const res = await db.execute({
      sql: 'SELECT value FROM system_config WHERE key = ? LIMIT 1',
      args: [key],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0].value === null ? null : String(res.rows[0].value);
  } catch (error) {
    console.error(`[db] Failed reading config "${key}":`, error);
    return null;
  }
}

export async function setConfigValueSql(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, now],
  });
}

export async function deleteConfigValueSql(key: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM system_config WHERE key = ?', args: [key] });
}

export async function getSystemConfigSql(): Promise<SystemConfig> {
  const db = await getDb();
  try {
    const result = await db.execute('SELECT key, value FROM system_config');
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(String(row.key), String(row.value));
    }

    const level = map.get('announcementLevel');
    return {
      baseUrl:
        map.get('baseUrl') ||
        (process.env.PREXZY_API_BASE_URL || 'https://prexzyapis.com').replace(/\/+$/, ''),
      announcement:
        map.get('announcement') ||
        'StreamPulse is online — fast HD streaming and media extraction ready.',
      announcementActive: map.get('announcementActive') !== 'false',
      announcementLevel:
        level === 'success' || level === 'warning' || level === 'critical' ? level : 'info',
      rateLimitEnabled: map.get('rateLimitEnabled') === 'true',
      rateLimitRpm: Math.min(600, Math.max(5, Number(map.get('rateLimitRpm')) || 60)),
      maintenanceMode: map.get('maintenanceMode') === 'true',
      nsfwEnabled: map.get('nsfwEnabled') !== 'false',
      searchEnabled: map.get('searchEnabled') !== 'false',
      downloadsEnabled: map.get('downloadsEnabled') !== 'false',
    };
  } catch (error) {
    console.error('[db] Error reading system config:', error);
    return {
      baseUrl: (process.env.PREXZY_API_BASE_URL || 'https://prexzyapis.com').replace(/\/+$/, ''),
      announcement: 'StreamPulse is online — fast HD streaming and media extraction ready.',
      announcementActive: true,
      announcementLevel: 'info',
      rateLimitEnabled: false,
      rateLimitRpm: 60,
      maintenanceMode: false,
      nsfwEnabled: process.env.NSFW_ENABLED !== 'false',
      searchEnabled: true,
      downloadsEnabled: true,
    };
  }
}

export async function updateSystemConfigSql(updates: Partial<SystemConfig>): Promise<void> {
  const entries: Array<[string, string]> = [];
  if (updates.baseUrl !== undefined) entries.push(['baseUrl', updates.baseUrl]);
  if (updates.announcement !== undefined) entries.push(['announcement', updates.announcement]);
  if (updates.announcementActive !== undefined) {
    entries.push(['announcementActive', String(updates.announcementActive)]);
  }
  if (updates.announcementLevel !== undefined) {
    entries.push(['announcementLevel', updates.announcementLevel]);
  }
  if (updates.rateLimitEnabled !== undefined) {
    entries.push(['rateLimitEnabled', String(updates.rateLimitEnabled)]);
  }
  if (updates.rateLimitRpm !== undefined) {
    entries.push(['rateLimitRpm', String(updates.rateLimitRpm)]);
  }
  if (updates.maintenanceMode !== undefined) {
    entries.push(['maintenanceMode', String(updates.maintenanceMode)]);
  }
  if (updates.nsfwEnabled !== undefined) {
    entries.push(['nsfwEnabled', String(updates.nsfwEnabled)]);
  }
  if (updates.searchEnabled !== undefined) {
    entries.push(['searchEnabled', String(updates.searchEnabled)]);
  }
  if (updates.downloadsEnabled !== undefined) {
    entries.push(['downloadsEnabled', String(updates.downloadsEnabled)]);
  }

  for (const [key, value] of entries) {
    await setConfigValueSql(key, value);
  }
}

/* ==========================================================================
   ADMIN SESSIONS
   ========================================================================== */

export async function getOrCreateSessionSecretSql(): Promise<string> {
  const existing = await getConfigValueSql('sessionSecret');
  if (existing && existing.length >= 32) return existing;

  const secret = crypto.randomBytes(48).toString('base64url');
  await setConfigValueSql('sessionSecret', secret);
  return secret;
}

export async function getAdminSessionVersionSql(): Promise<number> {
  const raw = await getConfigValueSql('adminSessionVersion');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export async function bumpAdminSessionVersionSql(): Promise<number> {
  const current = await getAdminSessionVersionSql();
  const next = current + 1;
  await setConfigValueSql('adminSessionVersion', String(next));
  return next;
}

export async function createAdminSessionSql(input: {
  id: string;
  createdAt: string;
  expiresAt: string;
  clientIp?: string;
  userAgent?: string;
}): Promise<void> {
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
      input.userAgent || null,
    ],
  });
}

export async function getAdminSessionSql(id: string): Promise<{
  id: string;
  expiresAt: string;
  lastSeenAt: string;
  revoked: boolean;
} | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT id, expires_at, last_seen_at, revoked FROM admin_sessions WHERE id = ? LIMIT 1',
    args: [id],
  });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: String(row.id),
    expiresAt: String(row.expires_at),
    lastSeenAt: String(row.last_seen_at),
    revoked: Number(row.revoked) === 1,
  };
}

export async function touchAdminSessionSql(id: string, lastSeenAt: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: 'UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?',
    args: [lastSeenAt, id],
  });
}

export async function revokeAdminSessionSql(id: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: 'UPDATE admin_sessions SET revoked = 1 WHERE id = ?', args: [id] });
}

export async function revokeAllAdminSessionsSql(exceptId?: string): Promise<void> {
  const db = await getDb();
  if (exceptId) {
    await db.execute({
      sql: 'UPDATE admin_sessions SET revoked = 1 WHERE id != ?',
      args: [exceptId],
    });
  } else {
    await db.execute('UPDATE admin_sessions SET revoked = 1');
  }
}

export async function listAdminSessionsSql(currentId?: string): Promise<AdminSession[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT id, created_at, expires_at, last_seen_at, client_ip, user_agent
          FROM admin_sessions
          WHERE revoked = 0 AND expires_at > ?
          ORDER BY created_at DESC
          LIMIT 50`,
    args: [new Date().toISOString()],
  });

  return res.rows.map(row => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    lastSeenAt: String(row.last_seen_at),
    clientIp: row.client_ip ? String(row.client_ip) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    current: currentId ? String(row.id) === currentId : false,
  }));
}

export async function countActiveAdminSessionsSql(): Promise<number> {
  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT COUNT(*) AS total FROM admin_sessions WHERE revoked = 0 AND expires_at > ?',
    args: [new Date().toISOString()],
  });
  return Number(res.rows[0]?.total || 0);
}

export async function pruneAdminSessionsSql(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await db.execute({
    sql: 'DELETE FROM admin_sessions WHERE expires_at < ? OR (revoked = 1 AND created_at < ?)',
    args: [new Date().toISOString(), cutoff],
  });
  return Number(res.rowsAffected || 0);
}

/* ==========================================================================
   BLOCKED IPS
   ========================================================================== */

export async function listBlockedIpsSql(): Promise<BlockedIp[]> {
  const db = await getDb();
  const res = await db.execute('SELECT ip, reason, created_at FROM blocked_ips ORDER BY created_at DESC LIMIT 1000');
  return res.rows.map(row => ({
    ip: String(row.ip),
    reason: row.reason ? String(row.reason) : undefined,
    createdAt: String(row.created_at),
  }));
}

export async function addBlockedIpSql(ip: string, reason?: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO blocked_ips (ip, reason, created_at) VALUES (?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason`,
    args: [ip, reason || null, new Date().toISOString()],
  });
}

export async function removeBlockedIpSql(ip: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute({ sql: 'DELETE FROM blocked_ips WHERE ip = ?', args: [ip] });
  return Number(res.rowsAffected || 0) > 0;
}

/* ==========================================================================
   AUDIT LOGS
   ========================================================================== */

export async function recordLogSql(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<LogEntry> {
  const db = await getDb();
  const fullEntry: LogEntry = {
    id: `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
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
        fullEntry.requestId || null,
      ],
    });

    const isSuccess = fullEntry.status >= 200 && fullEntry.status < 400;
    await db.execute(
      `UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = 'totalRequests'`
    );
    await db.execute({
      sql: 'UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?',
      args: [isSuccess ? 'successfulRequests' : 'failedRequests'],
    });
    if (fullEntry.action === 'stream') {
      await db.execute({
        sql: 'UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?',
        args: ['totalStreams'],
      });
    } else if (fullEntry.action === 'download') {
      await db.execute({
        sql: 'UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?',
        args: ['totalDownloads'],
      });
    }
  } catch (error) {
    console.error('[db] Error inserting audit log:', error);
  }

  return fullEntry;
}

export async function incrementTelemetryCounterSql(name: string): Promise<void> {
  const allowed = new Set(['totalRequests', 'successfulRequests', 'failedRequests', 'totalStreams', 'totalDownloads']);
  if (!allowed.has(name)) return;
  const db = await getDb();
  await db.execute({
    sql: 'UPDATE telemetry_counters SET counter_value = counter_value + 1 WHERE counter_name = ?',
    args: [name],
  });
}

export interface LogFilters {
  platform?: string;
  action?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function queryLogsSql(filters: LogFilters): Promise<{ total: number; logs: LogEntry[] }> {
  const db = await getDb();
  try {
    const conditions: string[] = [];
    const args: Array<string | number> = [];

    if (filters.platform && filters.platform !== 'all') {
      conditions.push('LOWER(platform) = LOWER(?)');
      args.push(filters.platform);
    }
    if (filters.action && filters.action !== 'all') {
      conditions.push('LOWER(action) = LOWER(?)');
      args.push(filters.action);
    }
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'success') conditions.push('status >= 200 AND status < 400');
      else if (filters.status === 'error') conditions.push('status >= 400');
    }
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conditions.push('(input LIKE ? OR error LIKE ? OR payload_summary LIKE ? OR client_ip LIKE ?)');
      args.push(pattern, pattern, pattern, pattern);
    }
    if (filters.from) {
      conditions.push('timestamp >= ?');
      args.push(filters.from);
    }
    if (filters.to) {
      conditions.push('timestamp <= ?');
      args.push(filters.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      args,
    });
    const total = Number(countRes.rows[0]?.total || 0);

    const limit = Math.min(Math.max(filters.limit || 100, 1), 1000);
    const offset = Math.max(filters.offset || 0, 0);

    const logsRes = await db.execute({
      sql: `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    const logs: LogEntry[] = logsRes.rows.map(row => ({
      id: String(row.id),
      timestamp: String(row.timestamp),
      platform: String(row.platform),
      action: String(row.action) as LogEntry['action'],
      input: String(row.input),
      status: Number(row.status),
      latencyMs: Number(row.latency_ms),
      clientIp: row.client_ip ? String(row.client_ip) : undefined,
      userAgent: row.user_agent ? String(row.user_agent) : undefined,
      error: row.error ? String(row.error) : undefined,
      payloadSummary: row.payload_summary ? String(row.payload_summary) : undefined,
      requestId: row.request_id ? String(row.request_id) : undefined,
    }));

    return { total, logs };
  } catch (error) {
    console.error('[db] Error querying logs:', error);
    return { total: 0, logs: [] };
  }
}

export async function deleteLogSql(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute({ sql: 'DELETE FROM audit_logs WHERE id = ?', args: [id] });
  return Number(res.rowsAffected || 0) > 0;
}

export async function clearLogsSql(): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM audit_logs');
}

export async function deleteOldLogsSql(olderThanDays: number): Promise<number> {
  const db = await getDb();
  const days = Math.min(Math.max(Math.round(olderThanDays), 1), 3650);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const res = await db.execute({ sql: 'DELETE FROM audit_logs WHERE timestamp < ?', args: [cutoff] });
  return Number(res.rowsAffected || 0);
}

/* ==========================================================================
   TELEMETRY & STATS
   ========================================================================== */

export async function getAdminStatsSql(): Promise<AdminStats> {
  const db = await getDb();
  try {
    const counterRes = await db.execute('SELECT counter_name, counter_value FROM telemetry_counters');
    const counters = new Map<string, number>();
    for (const row of counterRes.rows) {
      counters.set(String(row.counter_name), Number(row.counter_value || 0));
    }

    const platformRes = await db.execute(
      'SELECT platform, COUNT(*) AS count FROM audit_logs GROUP BY platform'
    );
    const platformBreakdown: Record<string, number> = {
      youtube: 0,
      terabox: 0,
      facebook: 0,
      instagram: 0,
      tiktok: 0,
      pinterest: 0,
      xnxx: 0,
      xvideos: 0,
      aio: 0,
      system: 0,
    };
    for (const row of platformRes.rows) {
      platformBreakdown[String(row.platform).toLowerCase()] = Number(row.count || 0);
    }

    const actionRes = await db.execute(
      'SELECT action, COUNT(*) AS count FROM audit_logs GROUP BY action'
    );
    const actionBreakdown: Record<string, number> = {
      extract: 0,
      stream: 0,
      download: 0,
      search: 0,
      admin: 0,
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

    const errRes = await db.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE status >= 400');
    const recentErrorsCount = Number(errRes.rows[0]?.total || 0);

    const uniqueRes = await db.execute(
      'SELECT COUNT(DISTINCT client_ip) AS total FROM audit_logs WHERE client_ip IS NOT NULL'
    );
    const uniqueClients = Number(uniqueRes.rows[0]?.total || 0);

    const last24hCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last24hRes = await db.execute({
      sql: 'SELECT COUNT(*) AS total FROM audit_logs WHERE timestamp >= ?',
      args: [last24hCutoff],
    });
    const requestsLast24h = Number(last24hRes.rows[0]?.total || 0);

    const totalRequests = counters.get('totalRequests') || 0;
    const failedRequests = counters.get('failedRequests') || 0;

    return {
      totalRequests,
      successfulRequests: counters.get('successfulRequests') || 0,
      failedRequests,
      totalStreams: counters.get('totalStreams') || 0,
      totalDownloads: counters.get('totalDownloads') || 0,
      averageLatencyMs,
      platformBreakdown,
      actionBreakdown,
      recentErrorsCount,
      uniqueClients,
      requestsLast24h,
      errorRate: totalRequests > 0 ? Math.round((failedRequests / totalRequests) * 1000) / 10 : 0,
    };
  } catch (error) {
    console.error('[db] Error reading admin stats:', error);
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
      errorRate: 0,
    };
  }
}

export async function resetStatsSql(): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE telemetry_counters SET counter_value = 0');
}

/* ==========================================================================
   MEDIA HISTORY
   ========================================================================== */

export async function saveMediaHistorySql(media: UniversalMediaItem): Promise<void> {
  const db = await getDb();
  try {
    const id = `media_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
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
        new Date().toISOString(),
      ],
    });
  } catch (error) {
    console.warn('[db] Could not save media history:', error);
  }
}

function mapMediaRow(row: Record<string, unknown>): MediaHistoryEntry {
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
    thumbnail: row.thumbnail ? String(row.thumbnail) : undefined,
    duration: row.duration ? String(row.duration) : undefined,
    author: row.author ? String(row.author) : undefined,
    mediaType: row.media_type ? String(row.media_type) : undefined,
    downloads,
    createdAt: String(row.created_at),
  };
}

export async function getRecentMediaHistorySql(limit = 30): Promise<MediaHistoryEntry[]> {
  const db = await getDb();
  try {
    const res = await db.execute({
      sql: 'SELECT * FROM media_history ORDER BY created_at DESC LIMIT ?',
      args: [Math.min(Math.max(limit, 1), 200)],
    });
    return res.rows.map(mapMediaRow);
  } catch (error) {
    console.error('[db] Error reading media history:', error);
    return [];
  }
}

export async function getPublicMediaHistorySql(
  limit = 8,
  includeNsfw = true
): Promise<MediaHistoryEntry[]> {
  const db = await getDb();
  try {
    const nsfwClause = includeNsfw ? '' : "AND platform NOT IN ('xnxx','xvideos')";
    const res = await db.execute({
      sql: `SELECT id, platform, title, thumbnail, duration, author, media_type, created_at, '[]' AS formats_json
            FROM media_history
            WHERE title IS NOT NULL ${nsfwClause}
            ORDER BY created_at DESC LIMIT ?`,
      args: [Math.min(Math.max(limit, 1), 24)],
    });
    return res.rows.map(row => ({
      ...mapMediaRow(row),
      url: '',
    }));
  } catch (error) {
    console.error('[db] Error reading public media history:', error);
    return [];
  }
}

export async function queryMediaHistorySql(filters: {
  q?: string;
  platform?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: MediaHistoryEntry[] }> {
  const db = await getDb();
  try {
    const conditions: string[] = [];
    const args: Array<string | number> = [];
    if (filters.platform && filters.platform !== 'all') {
      conditions.push('LOWER(platform) = LOWER(?)');
      args.push(filters.platform);
    }
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conditions.push('(title LIKE ? OR url LIKE ? OR author LIKE ?)');
      args.push(pattern, pattern, pattern);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM media_history ${where}`,
      args,
    });
    const total = Number(countRes.rows[0]?.total || 0);

    const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
    const offset = Math.max(filters.offset || 0, 0);
    const res = await db.execute({
      sql: `SELECT * FROM media_history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    return { total, items: res.rows.map(mapMediaRow) };
  } catch (error) {
    console.error('[db] Error querying media history:', error);
    return { total: 0, items: [] };
  }
}

export async function deleteMediaHistorySql(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute({ sql: 'DELETE FROM media_history WHERE id = ?', args: [id] });
  return Number(res.rowsAffected || 0) > 0;
}

export async function clearMediaHistorySql(): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM media_history');
}

/* ==========================================================================
   ANALYTICS
   ========================================================================== */

async function queryNamedCounts(
  db: Client,
  sql: string,
  args: Array<string | number>,
  limit: number
): Promise<NamedCount[]> {
  const res = await db.execute({ sql, args });
  return res.rows.slice(0, limit).map(row => ({
    name: String(row.name ?? 'unknown'),
    count: Number(row.count || 0),
  }));
}

export async function getAnalyticsSeriesSql(hours = 24): Promise<AnalyticsPoint[]> {
  const db = await getDb();
  const safeHours = Math.min(Math.max(Math.round(hours), 1), 720);
  const start = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);

  const res = await db.execute({
    sql: `SELECT substr(timestamp, 1, 13) AS bucket,
                 COUNT(*) AS requests,
                 SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
          FROM audit_logs
          WHERE timestamp >= ?
          GROUP BY bucket
          ORDER BY bucket ASC`,
    args: [start.toISOString()],
  });

  const byBucket = new Map<string, { requests: number; errors: number }>();
  for (const row of res.rows) {
    byBucket.set(String(row.bucket), {
      requests: Number(row.requests || 0),
      errors: Number(row.errors || 0),
    });
  }

  const points: AnalyticsPoint[] = [];
  for (let i = 0; i <= safeHours; i += 1) {
    const pointDate = new Date(start.getTime() + i * 60 * 60 * 1000);
    const bucket = pointDate.toISOString().slice(0, 13);
    const value = byBucket.get(bucket);
    points.push({
      label: pointDate.toISOString(),
      requests: value?.requests || 0,
      errors: value?.errors || 0,
    });
  }
  return points;
}

export async function getTopAnalyticsSql(): Promise<{
  topPlatforms: NamedCount[];
  topActions: NamedCount[];
  topInputs: NamedCount[];
  topClients: NamedCount[];
  mediaSummary: NamedCount[];
}> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
    ),
  ]);

  return { topPlatforms, topActions, topInputs, topClients, mediaSummary };
}

/* ==========================================================================
   DIAGNOSTICS
   ========================================================================== */

export async function getDatabaseDiagnostics(): Promise<{
  connected: boolean;
  type: string;
  path: string;
  fileSizeBytes: number;
  totalLogs: number;
  totalMediaHistory: number;
  remote: boolean;
}> {
  try {
    const db = await getDb();
    const [logsRes, mediaRes] = await Promise.all([
      db.execute('SELECT COUNT(*) AS c FROM audit_logs'),
      db.execute('SELECT COUNT(*) AS c FROM media_history'),
    ]);

    let size = 0;
    if (!databaseInfo.remote && databaseInfo.displayPath && fs.existsSync(databaseInfo.displayPath)) {
      size = fs.statSync(databaseInfo.displayPath).size;
    }

    return {
      connected: true,
      type: databaseInfo.remote ? 'libSQL (Turso)' : 'SQLite (libSQL driver)',
      path: databaseInfo.displayPath || getDatabasePath(),
      fileSizeBytes: size,
      totalLogs: Number(logsRes.rows[0]?.c || 0),
      totalMediaHistory: Number(mediaRes.rows[0]?.c || 0),
      remote: databaseInfo.remote,
    };
  } catch {
    return {
      connected: false,
      type: databaseInfo.remote ? 'libSQL (Turso)' : 'SQLite (libSQL driver)',
      path: getDatabasePath(),
      fileSizeBytes: 0,
      totalLogs: 0,
      totalMediaHistory: 0,
      remote: databaseInfo.remote,
    };
  }
}

export async function exportDatabaseSnapshotSql(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const [config, logs, media, counters, blocked] = await Promise.all([
    db.execute('SELECT key, value, updated_at FROM system_config'),
    db.execute('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000'),
    db.execute('SELECT * FROM media_history ORDER BY created_at DESC LIMIT 2000'),
    db.execute('SELECT * FROM telemetry_counters'),
    db.execute('SELECT * FROM blocked_ips'),
  ]);

  const secretKeys = new Set(['sessionSecret', 'adminPasswordHash', 'adminPassword']);
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    config: config.rows
      .filter(row => !secretKeys.has(String(row.key)))
      .map(row => ({ key: row.key, value: row.value, updatedAt: row.updated_at })),
    counters: counters.rows.map(row => ({
      name: row.counter_name,
      value: row.counter_value,
    })),
    logs: logs.rows,
    media: media.rows,
    blockedIps: blocked.rows,
  };
}
