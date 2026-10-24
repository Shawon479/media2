import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import type { AdminRuntimeInfo, AdminSession, BlockedIp, SystemConfig } from '../../types';
import { adminFetch } from './adminApi';
import {
  Badge,
  Card,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  SectionHeader,
  Spinner,
  inputClass,
} from './AdminUI';
import { formatDateTime, timeAgo, truncate } from '../../utils/format';

interface AdminSecurityProps {
  token: string;
  runtime: AdminRuntimeInfo | null;
  config: SystemConfig | null;
  onSessionExpired: () => void;
  onError: (message: string) => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export const AdminSecurity: React.FC<AdminSecurityProps> = ({
  token,
  runtime,
  config,
  onSessionExpired,
  onError,
  onToast,
}) => {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [ips, setIps] = useState<BlockedIp[]>([]);
  const [currentIp, setCurrentIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');
  const [ipError, setIpError] = useState('');
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<BlockedIp | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [sessionResponse, ipResponse] = await Promise.all([
          adminFetch<{ success: boolean; sessions: AdminSession[]; currentSessionId: string }>('/api/admin/sessions', token),
          adminFetch<{ success: boolean; ips: BlockedIp[]; currentIp: string }>('/api/admin/security/ips', token),
        ]);
        setSessions(sessionResponse.sessions);
        setCurrentSessionId(sessionResponse.currentSessionId);
        setIps(ipResponse.ips);
        setCurrentIp(ipResponse.currentIp);
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') return onSessionExpired();
        onError(error.message || 'Failed to load security data.');
      } finally {
        setLoading(false);
      }
    },
    [token, onSessionExpired, onError]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError('Use at least 10 characters for the new password.');
      return;
    }
    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }

    setBusy(true);
    try {
      await adminFetch('/api/admin/change-password', token, {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onToast('Password updated. All other admin sessions were revoked.', 'success');
      await load(true);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else setPasswordError(error.message || 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/sessions/${encodeURIComponent(revokeTarget.id)}`, token, { method: 'DELETE' });
      setSessions(prev => prev.filter(session => session.id !== revokeTarget.id));
      setRevokeTarget(null);
      onToast('Session revoked.', 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not revoke the session.');
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/sessions/revoke-others', token, { method: 'POST' });
      setSessions(prev => prev.filter(session => session.id === currentSessionId));
      setRevokeAllOpen(false);
      onToast('All other sessions have been revoked.', 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not revoke sessions.');
    } finally {
      setBusy(false);
    }
  };

  const blockIp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIpError('');
    if (!newIp.trim()) {
      setIpError('Enter an IPv4 or IPv6 address.');
      return;
    }
    setBusy(true);
    try {
      const response = await adminFetch<{ success: boolean; ip: string }>('/api/admin/security/ips', token, {
        method: 'POST',
        body: { ip: newIp.trim(), reason: newReason.trim() },
      });
      setIps(prev => [{ ip: response.ip, reason: newReason.trim() || undefined, createdAt: new Date().toISOString() }, ...prev.filter(item => item.ip !== response.ip)]);
      setNewIp('');
      setNewReason('');
      onToast(`IP ${response.ip} blocked.`, 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else setIpError(error.message || 'Could not block the IP.');
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    if (!unblockTarget) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/security/ips/${encodeURIComponent(unblockTarget.ip)}`, token, { method: 'DELETE' });
      setIps(prev => prev.filter(item => item.ip !== unblockTarget.ip));
      setUnblockTarget(null);
      onToast(`IP ${unblockTarget.ip} unblocked.`, 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not unblock the IP.');
    } finally {
      setBusy(false);
    }
  };

  const posture = [
    { label: 'HTTPS transport', ok: window.location.protocol === 'https:' || window.location.hostname === 'localhost', detail: window.location.protocol === 'https:' ? 'Encrypted in transit' : 'Enable TLS in production' },
    { label: 'Production mode', ok: runtime?.environment === 'production', detail: runtime?.environment || 'development' },
    { label: 'Rate limiting', ok: Boolean(config?.rateLimitEnabled), detail: config?.rateLimitEnabled ? `${config.rateLimitRpm} req/min` : 'Disabled' },
    { label: 'Remote database', ok: Boolean(runtime?.remoteDatabase), detail: runtime?.remoteDatabase ? 'Turso/libSQL' : 'Local SQLite' },
    { label: 'Adult content', ok: !config?.nsfwEnabled, detail: config?.nsfwEnabled ? 'Enabled' : 'Disabled' },
    { label: 'Admin password', ok: Boolean(runtime?.adminPasswordConfigured), detail: 'Environment or database' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Security</h1>
          <p className="mt-0.5 text-xs text-neutral-500">Passwords, active sessions and IP access control.</p>
        </div>
        <button
          onClick={() => void load(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Change admin password" description="Uses scrypt hashing. Other sessions are revoked after a change." />
          <form onSubmit={changePassword} className="space-y-3">
            <Field label="Current password">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className={`${inputClass} pl-9 pr-10`}
                />
                <button type="button" onClick={() => setShowPasswords(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-200" aria-label="Toggle password visibility">
                  {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New password" hint="At least 10 characters.">
                <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Confirm new password">
                <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className={inputClass} />
              </Field>
            </div>
            {passwordError && <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">{passwordError}</p>}
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60">
              {busy && <Spinner />} Update password
            </button>
          </form>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Security posture" description="A quick configuration checklist for this deployment." />
          <div className="space-y-2">
            {posture.map(item => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                {item.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="h-4 w-4 shrink-0 text-amber-400" />}
                <span className="flex-1 text-xs font-medium text-neutral-300">{item.label}</span>
                <span className="text-[10px] text-neutral-500">{item.detail}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-neutral-600">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
            Tip: deploy behind HTTPS, enable rate limiting, keep NSFW disabled for public/AdSense-friendly deployments,
            and use a remote Turso database on serverless platforms.
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader
          title="Active admin sessions"
          description={`${sessions.length} active session(s) · ${runtime?.sessionTtlHours || 12}h TTL`}
          action={
            sessions.length > 1 ? (
              <button onClick={() => setRevokeAllOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-800/60 bg-amber-950/30 px-2.5 py-1.5 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-950/60">
                <Users className="h-3 w-3" /> Revoke all others
              </button>
            ) : undefined
          }
        />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-neutral-500"><Spinner /> Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <EmptyState icon={Laptop} title="No active sessions" description="Sign in again to create a new session." />
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <div key={session.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${session.current ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                  <Laptop className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {session.current && <Badge tone="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">This device</Badge>}
                    <span className="font-mono text-[10px] text-neutral-500" title={session.id}>{truncate(session.id, 24)}</span>
                    <CopyButton value={session.id} label="" />
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-neutral-500" title={session.userAgent}>
                    {session.clientIp || 'Unknown IP'} · {truncate(session.userAgent || 'Unknown device', 70)}
                  </p>
                </div>
                <div className="text-right text-[10px] text-neutral-600">
                  <p>Started {timeAgo(session.createdAt)}</p>
                  <p>Expires {formatDateTime(session.expiresAt)}</p>
                </div>
                {!session.current && (
                  <button onClick={() => setRevokeTarget(session)} className="rounded-md border border-red-900/60 bg-red-950/30 p-1.5 text-red-400 transition hover:bg-red-950/60" title="Revoke session">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader title="Blocked IP addresses" description="Blocked clients receive HTTP 403 before any expensive work." />
        <form onSubmit={blockIp} className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="IP address" className="w-[190px]">
            <input value={newIp} onChange={event => setNewIp(event.target.value)} placeholder="203.0.113.10" className={inputClass} />
          </Field>
          <Field label="Reason (optional)" className="min-w-[180px] flex-1">
            <input value={newReason} onChange={event => setNewReason(event.target.value)} placeholder="Abuse, scraping, spam…" className={inputClass} />
          </Field>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-400 disabled:opacity-60">
            <Ban className="h-3.5 w-3.5" /> Block IP
          </button>
        </form>
        {ipError && <p className="mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">{ipError}</p>}
        <p className="mb-3 text-[10px] text-neutral-600">Your current IP: <span className="font-mono text-neutral-400">{currentIp || 'unknown'}</span> · You cannot block your own address.</p>
        {ips.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-4 text-center text-xs text-neutral-500">No blocked IPs.</p>
        ) : (
          <div className="space-y-1.5">
            {ips.map(item => (
              <div key={item.ip} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <Globe className="h-3.5 w-3.5 text-neutral-500" />
                <span className="font-mono text-xs text-neutral-200">{item.ip}</span>
                {item.reason && <span className="truncate text-[10px] text-neutral-500">— {item.reason}</span>}
                <span className="ml-auto text-[10px] text-neutral-600">{timeAgo(item.createdAt)}</span>
                <button onClick={() => setUnblockTarget(item)} className="rounded-md p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-emerald-300" title="Unblock">
                  <Shield className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={revokeAllOpen}
        title="Revoke all other sessions?"
        message="Every admin session except this one will be signed out immediately. Use this after a suspected password leak."
        confirmLabel="Revoke others"
        busy={busy}
        onCancel={() => setRevokeAllOpen(false)}
        onConfirm={() => void revokeOthers()}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke this session?"
        message={`The device at ${revokeTarget?.clientIp || 'unknown IP'} will be signed out immediately.`}
        confirmLabel="Revoke session"
        busy={busy}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => void revokeSession()}
      />

      <ConfirmDialog
        open={Boolean(unblockTarget)}
        title="Unblock this IP?"
        message={`${unblockTarget?.ip || ''} will be allowed to access the public API again.`}
        confirmLabel="Unblock IP"
        danger={false}
        busy={busy}
        onCancel={() => setUnblockTarget(null)}
        onConfirm={() => void unblock()}
      />
    </div>
  );
};
