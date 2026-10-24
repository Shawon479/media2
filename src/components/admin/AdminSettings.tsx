import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  HardDrive,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import type { AdminRuntimeInfo, SystemConfig } from '../../types';
import { adminDownload, adminFetch } from './adminApi';
import { AnnouncementPreview } from '../AnnouncementBanner';
import { usePublicConfig } from '../../context/ConfigContext';
import {
  Badge,
  Card,
  ConfirmDialog,
  Field,
  Modal,
  SectionHeader,
  Spinner,
  Toggle,
  inputClass,
  selectClass,
} from './AdminUI';
import { formatDateTime } from '../../utils/format';

interface AdminSettingsProps {
  token: string;
  config: SystemConfig | null;
  runtime: AdminRuntimeInfo | null;
  onSessionExpired: () => void;
  onError: (message: string) => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
  onConfigUpdated: (config: SystemConfig, runtime: AdminRuntimeInfo) => void;
}

type Section = 'general' | 'features' | 'data';

const SECTIONS: Array<{ id: Section; label: string; icon: React.ElementType }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'features', label: 'Features & limits', icon: SlidersHorizontal },
  { id: 'data', label: 'Data & backups', icon: Database },
];

const DEFAULT_FORM: SystemConfig = {
  baseUrl: '',
  announcement: '',
  announcementActive: false,
  announcementLevel: 'info',
  rateLimitEnabled: false,
  rateLimitRpm: 60,
  maintenanceMode: false,
  nsfwEnabled: true,
  searchEnabled: true,
  downloadsEnabled: true,
};

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  token,
  config,
  runtime,
  onSessionExpired,
  onError,
  onToast,
  onConfigUpdated,
}) => {
  const { refresh: refreshPublicConfig } = usePublicConfig();
  const [section, setSection] = useState<Section>('general');
  const [form, setForm] = useState<SystemConfig>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [confirm, setConfirm] = useState<null | 'reset' | 'logs' | 'optimize' | 'prune'>(null);
  const [pruneDays, setPruneDays] = useState(30);
  const [lastSaved, setLastSaved] = useState('');

  useEffect(() => {
    if (config) setForm({ ...config });
  }, [config]);

  const dirty = useMemo(() => {
    if (!config) return false;
    return (Object.keys(DEFAULT_FORM) as Array<keyof SystemConfig>).some(key => form[key] !== config[key]);
  }, [form, config]);

  const update = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const response = await adminFetch<{ success: boolean; config: SystemConfig; runtime: AdminRuntimeInfo }>(
        '/api/admin/config',
        token,
        { method: 'POST', body: form }
      );
      onConfigUpdated(response.config, response.runtime);
      setForm({ ...response.config });
      setLastSaved(new Date().toISOString());
      void refreshPublicConfig();
      onToast('Configuration saved and applied instantly across the deployment.', 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') return onSessionExpired();
      onError(error.message || 'Could not save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (config) setForm({ ...config });
  };

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    setBusyAction(key);
    try {
      await action();
      onToast(successMessage, 'success');
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') return onSessionExpired();
      onError(error.message || 'The action failed.');
    } finally {
      setBusyAction('');
    }
  };

  const exportSnapshot = () =>
    runAction(
      'export',
      async () => {
        await adminDownload('/api/admin/database/export', token, `streampulse_snapshot_${Date.now()}.json`);
      },
      'JSON snapshot downloaded.'
    );

  const downloadDatabase = () =>
    runAction(
      'download',
      async () => {
        await adminDownload('/api/admin/database/download', token, 'streampulse_backup.db');
      },
      'SQLite database downloaded.'
    );

  const optimizeDatabase = () => {
    setConfirm(null);
    return runAction(
      'optimize',
      async () => {
        await adminFetch('/api/admin/database/optimize', token, { method: 'POST' });
      },
      'Database optimized (PRAGMA optimize + VACUUM).'
    );
  };

  const resetStats = () => {
    setConfirm(null);
    return runAction(
      'reset',
      async () => {
        await adminFetch('/api/admin/reset-stats', token, { method: 'POST' });
      },
      'Telemetry counters reset. Historical logs and media history are unchanged.'
    );
  };

  const clearLogs = () => {
    setConfirm(null);
    return runAction(
      'logs',
      async () => {
        await adminFetch('/api/admin/logs', token, { method: 'DELETE' });
      },
      'All audit logs cleared.'
    );
  };

  const pruneLogs = () => {
    setConfirm(null);
    return runAction(
      'prune',
      async () => {
        await adminFetch('/api/admin/logs/prune', token, { method: 'POST', body: { days: pruneDays } });
      },
      `Logs older than ${pruneDays} day(s) pruned.`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Settings</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Control the upstream gateway, announcements, public features, limits and backups.
            {lastSaved && <span className="ml-1.5 text-neutral-600">Saved {formatDateTime(lastSaved)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <Badge tone="bg-amber-500/10 text-amber-300 border-amber-500/20">
              <AlertTriangle className="h-3 w-3" /> Unsaved changes
            </Badge>
          )}
          <button
            onClick={reset}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-1.5">
        {SECTIONS.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                section === item.id ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          );
        })}
      </div>

      {!config ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-10 text-xs text-neutral-500">
          <Spinner /> Loading configuration…
        </div>
      ) : (
        <>
          {section === 'general' && (
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <Card className="p-4">
                <SectionHeader title="Upstream gateway" description="All extraction and search requests are proxied through this base URL." />
                <form onSubmit={save} className="space-y-4">
                  <Field
                    label="Gateway base URL"
                    hint="Must be a public http(s) origin. SSRF protection blocks private networks and metadata IPs."
                  >
                    <input
                      value={form.baseUrl}
                      onChange={event => update('baseUrl', event.target.value)}
                      placeholder="https://prexzyapis.com"
                      spellCheck={false}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </Field>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-emerald-400" />
                      <p className="text-xs font-bold text-neutral-200">Announcement banner</p>
                    </div>
                    <div className="space-y-3">
                      <Toggle
                        checked={form.announcementActive}
                        onChange={value => update('announcementActive', value)}
                        label="Show announcement"
                        description="Displayed at the top of every public page until dismissed."
                      />
                      <Field label="Message" hint={`${form.announcement.length}/300 characters`}>
                        <textarea
                          value={form.announcement}
                          onChange={event => update('announcement', event.target.value.slice(0, 300))}
                          rows={3}
                          placeholder="StreamPulse is online — fast HD streaming, Terabox playback and MP3 extraction."
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Tone">
                        <select
                          value={form.announcementLevel}
                          onChange={event => update('announcementLevel', event.target.value as SystemConfig['announcementLevel'])}
                          className={selectClass}
                        >
                          <option value="info">Info — blue</option>
                          <option value="success">Success — green</option>
                          <option value="warning">Warning — amber</option>
                          <option value="critical">Critical — red</option>
                        </select>
                      </Field>
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Live preview</p>
                        <AnnouncementPreview level={form.announcementLevel} message={form.announcement} />
                      </div>
                    </div>
                  </div>

                  {dirty && (
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={reset} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300">
                        Discard
                      </button>
                      <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-50">
                        {saving && <Spinner />} Save configuration
                      </button>
                    </div>
                  )}
                </form>
              </Card>

              <div className="space-y-4">
                <Card className="p-4">
                  <SectionHeader title="Runtime" description="Identity of this deployment." />
                  <div className="space-y-2 text-xs">
                    {[
                      ['Version', `v${runtime?.version || '—'}`],
                      ['Environment', runtime?.environment || 'development'],
                      ['Node.js', runtime?.nodeVersion || '—'],
                      ['Database', runtime?.remoteDatabase ? 'Turso / libSQL (remote)' : 'SQLite (local)'],
                      ['Session TTL', `${runtime?.sessionTtlHours || 12} hours`],
                      ['Admin password', runtime?.adminPasswordConfigured ? 'Configured' : 'Missing'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                        <span className="text-neutral-500">{label}</span>
                        <span className="truncate font-mono text-[11px] text-neutral-300">{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4">
                  <SectionHeader title="Configuration tips" />
                  <ul className="space-y-2 text-[11px] leading-relaxed text-neutral-500">
                    <li className="flex gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> Changes are stored in the database and survive restarts.</li>
                    <li className="flex gap-2"><Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> Public clients refresh config every 60 seconds or when the tab becomes visible.</li>
                    <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /> Always validate a new upstream URL with the API sandbox before saving it.</li>
                  </ul>
                </Card>
              </div>
            </div>
          )}

          {section === 'features' && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4">
                <SectionHeader title="Public feature flags" description="Hide or disable surfaces without redeploying." />
                <div className="space-y-4">
                  <Toggle
                    checked={form.searchEnabled}
                    onChange={value => update('searchEnabled', value)}
                    label="Explore search hub"
                    description="Shows the Search tab and allows /api/search. Disable for a minimal downloader-only site."
                  />
                  <Toggle
                    checked={form.downloadsEnabled}
                    onChange={value => update('downloadsEnabled', value)}
                    label="Download actions"
                    description="When off, download buttons and /api/proxy-download return 503. Streaming remains available."
                  />
                  <Toggle
                    checked={form.nsfwEnabled}
                    onChange={value => update('nsfwEnabled', value)}
                    label="Adult (18+) platforms"
                    description="Enables XNXX/Xvideos search and extraction, and includes them in admin media history. Public history always excludes them when off."
                    danger
                  />
                  {form.nsfwEnabled && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[10px] leading-relaxed text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      Disable this for AdSense-friendly or family-safe deployments. The public UI shows an 18+ gate while enabled.
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <SectionHeader title="Availability & protection" description="Maintenance and rate limiting are enforced server-side." />
                <div className="space-y-4">
                  <Toggle
                    checked={form.maintenanceMode}
                    onChange={value => update('maintenanceMode', value)}
                    label="Maintenance mode"
                    description="Returns 503 for public extraction, search and proxy routes. Admin console stays online."
                    danger
                  />
                  {form.maintenanceMode && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-[10px] leading-relaxed text-red-300">
                      <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                      Saving this will immediately pause the public gateway. Use the announcement field to explain the outage.
                    </p>
                  )}
                  <div className="h-px bg-neutral-800" />
                  <Toggle
                    checked={form.rateLimitEnabled}
                    onChange={value => update('rateLimitEnabled', value)}
                    label="Rate limiting"
                    description="Sliding-window limit per IP across public API routes. Admin endpoints have their own stricter limit."
                  />
                  <Field label="Requests per minute" hint="Between 5 and 600. Applies per client IP.">
                    <input
                      type="number"
                      min={5}
                      max={600}
                      value={form.rateLimitRpm}
                      onChange={event => update('rateLimitRpm', Math.max(5, Math.min(600, Number(event.target.value) || 5)))}
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[30, 60, 120].map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => update('rateLimitRpm', value)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                          form.rateLimitRpm === value
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {value} rpm
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-4 xl:col-span-2">
                <SectionHeader title="Effective public config" description="What unauthenticated clients currently receive." />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Maintenance', value: config.maintenanceMode, icon: Wrench },
                    { label: 'Search', value: config.searchEnabled, icon: SlidersHorizontal },
                    { label: 'Downloads', value: config.downloadsEnabled, icon: Download },
                    { label: '18+ content', value: config.nsfwEnabled, icon: ShieldAlert },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2.5">
                        <Icon className={`h-4 w-4 ${item.value ? 'text-emerald-400' : 'text-neutral-600'}`} />
                        <span className="flex-1 text-xs text-neutral-400">{item.label}</span>
                        <Badge tone={item.value ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}>
                          {item.value ? 'On' : 'Off'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {section === 'data' && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4">
                <SectionHeader title="Backups & export" description="Take a copy before destructive maintenance." />
                <div className="space-y-2">
                  <button
                    onClick={() => void exportSnapshot()}
                    disabled={Boolean(busyAction)}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left transition hover:border-emerald-500/30 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      {busyAction === 'export' ? <Spinner /> : <FileJson className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-200">JSON snapshot</p>
                      <p className="text-[10px] text-neutral-500">Config, counters, logs, media and blocked IPs. No secrets.</p>
                    </div>
                    <Download className="h-4 w-4 text-neutral-600" />
                  </button>

                  <button
                    onClick={() => void downloadDatabase()}
                    disabled={Boolean(busyAction) || runtime?.remoteDatabase}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left transition hover:border-sky-500/30 disabled:opacity-40"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                      {busyAction === 'download' ? <Spinner /> : <HardDrive className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-200">Download SQLite file</p>
                      <p className="text-[10px] text-neutral-500">
                        {runtime?.remoteDatabase ? 'Unavailable for remote Turso databases — use the JSON snapshot.' : 'Full local database backup.'}
                      </p>
                    </div>
                    <Download className="h-4 w-4 text-neutral-600" />
                  </button>

                  <button
                    onClick={() => setConfirm('optimize')}
                    disabled={Boolean(busyAction) || runtime?.remoteDatabase}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left transition hover:border-violet-500/30 disabled:opacity-40"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                      {busyAction === 'optimize' ? <Spinner /> : <Database className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-200">Optimize database</p>
                      <p className="text-[10px] text-neutral-500">Run PRAGMA optimize and VACUUM to reclaim space.</p>
                    </div>
                    <RefreshCw className="h-4 w-4 text-neutral-600" />
                  </button>
                </div>
              </Card>

              <Card className="p-4">
                <SectionHeader title="Log maintenance" description="Keep the audit trail lean and fast." />
                <div className="space-y-2">
                  <button
                    onClick={() => setConfirm('prune')}
                    disabled={Boolean(busyAction)}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left transition hover:border-amber-500/30 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                      {busyAction === 'prune' ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-200">Prune old logs</p>
                      <p className="text-[10px] text-neutral-500">Delete audit records older than a retention window.</p>
                    </div>
                    <Trash2 className="h-4 w-4 text-neutral-600" />
                  </button>

                  <button
                    onClick={() => setConfirm('logs')}
                    disabled={Boolean(busyAction)}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left transition hover:border-red-500/30 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                      {busyAction === 'logs' ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-200">Clear all logs</p>
                      <p className="text-[10px] text-neutral-500">Permanently delete every audit record.</p>
                    </div>
                    <Trash2 className="h-4 w-4 text-neutral-600" />
                  </button>
                </div>
                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                    <Database className="h-3 w-3" /> Database diagnostics
                  </div>
                  <div className="space-y-1 text-[10px] text-neutral-500">
                    <div className="flex justify-between"><span>Type</span><span className="font-mono">{runtime?.remoteDatabase ? 'Turso/libSQL' : 'SQLite'}</span></div>
                    <div className="flex justify-between"><span>Environment</span><span className="font-mono">{runtime?.environment || '—'}</span></div>
                    <div className="flex justify-between"><span>Last saved</span><span className="font-mono">{lastSaved ? formatDateTime(lastSaved) : '—'}</span></div>
                  </div>
                </div>
              </Card>

              <Card className="border-red-900/40 p-4 xl:col-span-2">
                <SectionHeader title="Danger zone" description="These actions cannot be undone. Export a snapshot first." />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-3">
                  <div>
                    <p className="text-xs font-semibold text-red-200">Reset telemetry counters</p>
                    <p className="mt-0.5 text-[10px] text-red-300/70">Zero request totals, streams, downloads and latency samples. Logs and media history stay intact.</p>
                  </div>
                  <button
                    onClick={() => setConfirm('reset')}
                    disabled={Boolean(busyAction)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-950/80 disabled:opacity-50"
                  >
                    {busyAction === 'reset' ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" />} Reset stats
                  </button>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-neutral-600">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Configuration secrets and password hashes are never included in snapshots.
                </p>
              </Card>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset telemetry counters?"
        message="All-time request, stream, download and latency statistics will be reset to zero. Audit logs and media history are preserved."
        confirmLabel="Reset counters"
        busy={busyAction === 'reset'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void resetStats()}
      />

      <ConfirmDialog
        open={confirm === 'logs'}
        title="Clear every audit log?"
        message="This permanently deletes all request and admin audit records. Export a JSON snapshot or CSV first if you need them."
        confirmLabel="Clear all logs"
        busy={busyAction === 'logs'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void clearLogs()}
      />

      <ConfirmDialog
        open={confirm === 'optimize'}
        title="Optimize the SQLite database?"
        message="Runs PRAGMA optimize and VACUUM. The database may be locked briefly, so expect a short pause in writes."
        confirmLabel="Optimize now"
        busy={busyAction === 'optimize'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void optimizeDatabase()}
      />

      <Modal
        open={confirm === 'prune'}
        onClose={() => setConfirm(null)}
        title="Prune old audit logs"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirm(null)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={() => void pruneLogs()}
              disabled={busyAction === 'prune'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {busyAction === 'prune' && <Spinner />} Prune logs
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs leading-relaxed text-neutral-400">
          <p>
            Audit records older than the retention window will be permanently deleted. Request counters and media
            history are not affected.
          </p>
          <Field label="Retention (days)" hint="Between 1 and 3650 days.">
            <input
              type="number"
              min={1}
              max={3650}
              value={pruneDays}
              onChange={event => setPruneDays(Math.max(1, Math.min(3650, Number(event.target.value) || 1)))}
              className={inputClass}
            />
          </Field>
          <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-300/80">
            Consider exporting a CSV or JSON snapshot from the Data tab before pruning.
          </p>
        </div>
      </Modal>
    </div>
  );
};
