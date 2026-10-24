import {
  createAdminSessionSql,
  countActiveAdminSessionsSql,
  deleteConfigValueSql,
  getAdminSessionSql,
  getAdminSessionVersionSql,
  getConfigValueSql,
  getOrCreateSessionSecretSql,
  listAdminSessionsSql,
  revokeAdminSessionSql,
  revokeAllAdminSessionsSql,
  setConfigValueSql,
  touchAdminSessionSql,
} from '../db/sqlite';
import type { AdminSession } from '../types';
import {
  createSessionToken,
  generateReadablePassword,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  randomToken,
  timingSafeEqualString,
  verifyPassword,
  verifySessionToken,
} from './authCrypto';

interface LoginAttempt {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export class AdminAuthService {
  private passwordHash = '';
  private sessionSecret = '';
  private sessionVersion = 1;
  private sessionTtlHours = 12;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private generatedPassword: string | null = null;
  private loginAttempts = new Map<string, LoginAttempt>();

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const ttl = Number(process.env.ADMIN_SESSION_HOURS);
      this.sessionTtlHours = Number.isFinite(ttl) ? Math.min(Math.max(ttl, 1), 168) : 12;

      const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
      const forceReset = process.env.ADMIN_PASSWORD_RESET === 'true';
      const storedHash = await getConfigValueSql('adminPasswordHash');
      const legacyPassword = await getConfigValueSql('adminPassword');

      if (forceReset && envPassword) {
        await this.persistPassword(envPassword);
        console.warn('[auth] ADMIN_PASSWORD_RESET=true — admin password re-seeded from ADMIN_PASSWORD.');
      } else if (!storedHash && envPassword) {
        await this.persistPassword(envPassword);
      } else if (!storedHash && legacyPassword) {
        // Migrate old plaintext installs to scrypt.
        await this.persistPassword(legacyPassword);
        await deleteConfigValueSql('adminPassword');
        console.warn('[auth] Migrated the legacy plaintext admin password to a scrypt hash.');
      } else if (!storedHash) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'ADMIN_PASSWORD is required on first production boot. Set it (12+ chars), then restart. ' +
              'To rotate it later, set ADMIN_PASSWORD_RESET=true for one boot.'
          );
        }
        this.generatedPassword = generateReadablePassword();
        await this.persistPassword(this.generatedPassword);
        console.warn('──────────────────────────────────────────────────────────────');
        console.warn('[auth] No ADMIN_PASSWORD set. Generated a development password:');
        console.warn(`[auth] ${this.generatedPassword}`);
        console.warn('[auth] Set ADMIN_PASSWORD in .env to choose your own.');
        console.warn('──────────────────────────────────────────────────────────────');
      } else {
        this.passwordHash = storedHash;
        if (legacyPassword) await deleteConfigValueSql('adminPassword');
      }

      const envSecret = (process.env.ADMIN_SESSION_SECRET || '').trim();
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

  get sessionTtl(): number {
    return this.sessionTtlHours;
  }

  get generatedDevPassword(): string | null {
    return this.generatedPassword;
  }

  async login(
    password: string,
    clientIp: string,
    userAgent: string
  ): Promise<{ token: string; expiresAt: string; sid: string }> {
    await this.initialize();

    const now = Date.now();
    const attempt = this.loginAttempts.get(clientIp);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      const waitSec = Math.ceil((attempt.lockedUntil - now) / 1000);
      throw new AuthError(
        `Too many failed attempts. Try again in ${Math.ceil(waitSec / 60)} minute(s).`,
        429
      );
    }

    if (!password || !verifyPassword(password, this.passwordHash)) {
      this.registerFailure(clientIp);
      throw new AuthError('Invalid admin password.', 401);
    }

    this.loginAttempts.delete(clientIp);
    await this.maybeUpgradeLegacyHash(password);

    const sid = randomToken(18);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlHours * 60 * 60 * 1000);
    const token = createSessionToken(
      {
        sub: 'admin',
        sid,
        ver: this.sessionVersion,
        iat: Math.floor(createdAt.getTime() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      this.sessionSecret
    );

    await createAdminSessionSql({
      id: sid,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      clientIp,
      userAgent,
    });

    return { token, expiresAt: expiresAt.toISOString(), sid };
  }

  async authenticate(token: string): Promise<{ sid: string; expiresAt: string } | null> {
    await this.initialize();
    if (!token) return null;

    const payload = verifySessionToken(token, this.sessionSecret);
    if (!payload) return null;
    if (payload.ver !== this.sessionVersion) return null;

    const session = await getAdminSessionSql(payload.sid);
    if (!session || session.revoked) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;

    const lastSeen = new Date(session.lastSeenAt).getTime();
    if (Date.now() - lastSeen > 5 * 60 * 1000) {
      await touchAdminSessionSql(payload.sid, new Date().toISOString()).catch(() => {});
    }

    return { sid: payload.sid, expiresAt: session.expiresAt };
  }

  async logout(token: string): Promise<void> {
    await this.initialize();
    const payload = verifySessionToken(token, this.sessionSecret);
    if (payload) {
      await revokeAdminSessionSql(payload.sid).catch(() => {});
    }
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    currentSid: string
  ): Promise<void> {
    await this.initialize();

    if (!verifyPassword(currentPassword, this.passwordHash)) {
      throw new AuthError('Current password is incorrect.', 400);
    }

    const trimmed = (newPassword || '').trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    }
    if (trimmed === currentPassword) {
      throw new AuthError('New password must be different from the current password.', 400);
    }

    await this.persistPassword(trimmed);
    await revokeAllAdminSessionsSql(currentSid);
  }

  async listSessions(currentSid: string): Promise<AdminSession[]> {
    await this.initialize();
    return listAdminSessionsSql(currentSid);
  }

  async revokeOtherSessions(currentSid: string): Promise<void> {
    await this.initialize();
    await revokeAllAdminSessionsSql(currentSid);
  }

  async revokeSession(sid: string, currentSid: string): Promise<boolean> {
    await this.initialize();
    if (sid === currentSid) {
      throw new AuthError('Use logout to end the current session.', 400);
    }
    await revokeAdminSessionSql(sid);
    return true;
  }

  async activeSessionCount(): Promise<number> {
    await this.initialize();
    return countActiveAdminSessionsSql();
  }

  verifyCurrentPassword(password: string): boolean {
    return verifyPassword(password, this.passwordHash);
  }

  private registerFailure(ip: string): void {
    const now = Date.now();
    const existing = this.loginAttempts.get(ip);
    if (!existing || now - existing.firstFailureAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(ip, {
        failures: 1,
        firstFailureAt: now,
        lockedUntil: 0,
      });
      return;
    }

    existing.failures += 1;
    if (existing.failures >= MAX_LOGIN_ATTEMPTS) {
      existing.lockedUntil = now + LOGIN_WINDOW_MS;
    }
  }

  private async persistPassword(password: string): Promise<void> {
    this.passwordHash = hashPassword(password);
    await setConfigValueSql('adminPasswordHash', this.passwordHash);
  }

  private async maybeUpgradeLegacyHash(password: string): Promise<void> {
    // Re-hash on successful login if the stored value came from an old install.
    if (!this.passwordHash.startsWith('scrypt$')) {
      await this.persistPassword(password);
    }
  }
}

export class AuthError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'AuthError';
  }
}

export const adminAuth = new AdminAuthService();

export function isTimingSafeMatch(a: string, b: string): boolean {
  return timingSafeEqualString(a, b);
}
