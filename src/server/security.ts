import dns from 'node:dns/promises';
import net from 'node:net';
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

const PRIVATE_IPV4 = new net.BlockList();

// RFC1918, loopback, link-local, CGNAT, benchmarking, documentation, multicast and reserved ranges.
const BLOCKED_V4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

for (const [address, prefix] of BLOCKED_V4_CIDRS) {
  PRIVATE_IPV4.addSubnet(address, prefix, 'ipv4');
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'host.docker.internal',
  'gateway.docker.internal',
]);

const urlSafetyCache = new Map<string, { safe: boolean; expiresAt: number }>();
const DNS_CACHE_MS = 5 * 60 * 1000;

export function getClientIp(req: ExpressRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function isPrivateIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (!ip) return true;

  const version = net.isIP(ip);
  if (version === 4) {
    return PRIVATE_IPV4.check(ip, 'ipv4');
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (/^fe[89ab]/.test(lower)) return true; // link local
    if (lower.startsWith('ff')) return true; // multicast
    if (lower.startsWith('2001:db8')) return true; // documentation
    if (lower.startsWith('::ffff:')) {
      return isPrivateIp(lower.slice('::ffff:'.length));
    }
    return false;
  }

  // Not an IP at all — fail closed for callers that expect an address.
  return true;
}

export interface SafeUrlOptions {
  allowPrivate?: boolean;
}

export async function assertSafeHttpUrl(
  rawUrl: string,
  options: SafeUrlOptions = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not allowed');
  }

  const allowPrivate =
    options.allowPrivate ?? process.env.ALLOW_PRIVATE_PROXY === 'true';

  if (allowPrivate) return parsed;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Private or internal hostnames are not allowed');
  }

  const cached = urlSafetyCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.safe) throw new Error('Destination resolves to a private network');
    return parsed;
  }

  let addresses: Array<{ address: string; family: number }>;
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

  const blocked = addresses.find(entry => isPrivateIp(entry.address));
  urlSafetyCache.set(hostname, {
    safe: !blocked,
    expiresAt: Date.now() + DNS_CACHE_MS,
  });

  if (blocked) {
    throw new Error('Destination resolves to a private network');
  }

  return parsed;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  allowPrivate?: boolean;
}

/**
 * Fetches a remote URL while validating every redirect destination (SSRF guard).
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<globalThis.Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = (await assertSafeHttpUrl(rawUrl, options)).toString();
  let method = (init.method || 'GET').toUpperCase();
  let body = init.body;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const upstream = await fetch(currentUrl, {
      ...init,
      method,
      body,
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(upstream.status)) {
      return upstream;
    }

    const location = upstream.headers.get('location');
    if (!location) return upstream;

    if (redirects === maxRedirects) {
      throw new Error('Too many upstream redirects');
    }

    const nextUrl = new URL(location, currentUrl);
    await assertSafeHttpUrl(nextUrl.toString(), options);
    currentUrl = nextUrl.toString();

    if ([301, 302, 303].includes(upstream.status) && method !== 'GET' && method !== 'HEAD') {
      method = 'GET';
      body = undefined;
    }
  }

  throw new Error('Too many upstream redirects');
}

export function sanitizeFilename(filename: string, fallback = 'download'): string {
  const cleaned = filename
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

export function buildContentDisposition(filename: string, type: 'attachment' | 'inline' = 'attachment'): string {
  const safe = sanitizeFilename(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function securityHeaders() {
  return (_req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

export interface RateLimitState {
  enabled: boolean;
  rpm: number;
}

interface Bucket {
  hits: number[];
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastCleanup = Date.now();

  constructor(private readonly windowMs = 60_000) {}

  check(key: string, limit: number): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    this.maybeCleanup(now);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      this.buckets.set(key, bucket);
    }

    bucket.hits = bucket.hits.filter(ts => now - ts < this.windowMs);
    const allowed = bucket.hits.length < limit;
    if (allowed) bucket.hits.push(now);

    const oldest = bucket.hits[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000));

    return {
      allowed,
      remaining: Math.max(0, limit - bucket.hits.length),
      retryAfterSec,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }

  private maybeCleanup(now: number): void {
    if (now - this.lastCleanup < 60_000 && this.buckets.size < 10_000) return;
    this.lastCleanup = now;
    for (const [key, bucket] of this.buckets) {
      const hits = bucket.hits.filter(ts => now - ts < this.windowMs);
      if (hits.length === 0) this.buckets.delete(key);
      else bucket.hits = hits;
    }
  }
}

const publicLimiter = new SlidingWindowRateLimiter(60_000);

export function publicRateLimit(getState: () => RateLimitState) {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const state = getState();
    if (!state.enabled) {
      next();
      return;
    }

    const ip = getClientIp(req);
    const result = publicLimiter.check(ip, Math.max(1, state.rpm));
    res.setHeader('RateLimit-Limit', String(state.rpm));
    res.setHeader('RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: result.retryAfterSec,
      });
      return;
    }

    next();
  };
}

export function noStore(_req: ExpressRequest, res: ExpressResponse, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
