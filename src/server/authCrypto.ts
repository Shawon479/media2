import crypto from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 10;

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  // Legacy plaintext value (migrated to a hash on next successful login).
  if (!storedHash.startsWith('scrypt$')) {
    return timingSafeEqualString(password, storedHash);
  }

  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;

  const [, nRaw, rRaw, pRaw, salt, expectedHex] = parts;
  const params = {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 64 * 1024 * 1024,
  };

  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = crypto.scryptSync(password, salt, expected.length, params);
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    // Compare against itself to reduce timing leakage, then fail.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export interface SessionTokenPayload {
  sub: 'admin';
  sid: string;
  ver: number;
  iat: number;
  exp: number;
}

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(
  payload: SessionTokenPayload,
  secret: string
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string
): SessionTokenPayload | null {
  if (!token || !secret) return null;
  const segments = token.split('.');
  if (segments.length !== 2) return null;

  const [body, signature] = segments;
  const expected = sign(body, secret);
  if (!timingSafeEqualString(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (parsed?.sub !== 'admin' || typeof parsed.sid !== 'string') return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!Number.isFinite(parsed.ver)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateReadablePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(24);
  let result = '';
  for (const byte of bytes) {
    result += alphabet[byte % alphabet.length];
  }
  return result;
}
