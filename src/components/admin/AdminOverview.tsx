import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Database,
  Download,
  Gauge,
  HardDrive,
  MemoryStick,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Users,
  Wifi,
} from 'lucide-react';
import type { AdminAnalytics, AdminRuntimeInfo, AdminStats, AdminTab, SystemConfig } from '../../types';
import { adminFetch } from './adminApi';
import {
  Badge,
  Card,
  EmptyState,
  SectionHeader,
  Spinner,
  StatCard,
  TrafficChart,
} from './AdminUI';
import { formatBytes, formatDuration, formatNumber, platformLabel, statusTone, timeAgo } from '../../utils/format';

interface AdminOverviewProps {
  token: string;
  runtime: AdminRuntimeInfo | null;
  config: SystemConfig | null;
  onSessionExpired: () => void;
  onNavigate: (tab: AdminTab) => void;
  onError: (message: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  token,
  runtime,
  config,
  onSessionExpired,
  onNavigate,
  onError,
}) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      else setRefreshing(true);
      try {
        const [statsResponse, analyticsResponse] = await Promise.all([
          adminFetch<{ success: boolean; stats: AdminStats }>('/api/admin/stats', token),
          adminFetch<AdminAnalytics & { success: boolean }>('/api/admin/analytics?hours=24', token),
        ]);
        setStats(statsResponse.stats);
        setAnalytics(analyticsResponse);
        setLastUpdated(new Date().toISOString());
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') {
          onSessionExpired();
          return;
        }
        onError(error.message || 'Could not load the overview.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, onSessionExpired, onError]
  );

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-neutral-500">
        <Spinner className="h-5 w-5 text-emerald-400" /> Loading system overview…
      </div>
    );
  }

  if (!stats) {
    return <EmptyState title="Overview unavailable" description="The admin statistics endpoint did not return data." />;
  }

  const successRate = stats.totalRequests > 0 ? (stats.successfulRequests / stats.totalRequests) * 100 : 0;
  const platformEntries = Object.entries(stats.platformBreakdown)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const platformMax = Math.max(1, ...platformEntries.map(([, count]) => count));
  const diagnostics = stats.diagnostics;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">System overview</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Live traffic, media activity and runtime health at a glance.
            {lastUpdated && <span className="ml-1.5 text-neutral-600">Updated {timeAgo(lastUpdated)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            onClick={() => onNavigate('health')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400"
          >
            <Activity className="h-3.5 w-3.5" /> Health check
          </button>
        </div>
      </div>

      {config?.maintenanceMode && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-800/70 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          Maintenance mode is active. Public extraction, search and proxy routes are returning HTTP 503.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total requests" value={formatNumber(stats.totalRequests)} hint={`${formatNumber(stats.requestsLast24h || 0)} in last 24h`} icon={Activity} tone="emerald" />
        <StatCard label="Success rate" value={`${successRate.toFixed(1)}%`} hint={`${formatNumber(stats.successfulRequests)} successful`} icon={Gauge} tone="sky" />
        <StatCard label="Failed requests" value={formatNumber(stats.failedRequests)} hint={`${stats.errorRate ?? 0}% error rate`} icon={AlertTriangle} tone="red" />
        <StatCard label="Avg latency" value={`${formatNumber(stats.averageLatencyMs)}ms`} hint="Recent requests" icon={Clock} tone="violet" />
        <StatCard label="Streams served" value={formatNumber(stats.totalStreams)} hint="Direct + proxied" icon={Radio} tone="emerald" />
        <StatCard label="Downloads" value={formatNumber(stats.totalDownloads)} hint="Attachment transfers" icon={Download} tone="sky" />
        <StatCard label="Unique clients" value={formatNumber(stats.uniqueClients || 0)} hint={`${formatNumber(diagnostics?.activeSessions || 0)} active admin sessions`} icon={Users} tone="amber" />
        <StatCard label="Uptime" value={formatDuration(diagnostics?.uptimeSeconds || 0)} hint={`Memory ${formatNumber(diagnostics?.memoryUsageMB || 0)} MB`} icon={Server} tone="neutral" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <SectionHeader
            title="Requests · last 24 hours"
            description="Green = requests, red dashed = errors."
            action={<Badge tone="bg-emerald-500/10 text-emerald-300 border-emerald-500/20"><Wifi className="h-3 w-3" /> Live</Badge>}
          />
          <TrafficChart series={analytics?.series || []} height={210} />
        </Card>

        <Card className="p-4">
          <SectionHeader title="Platform mix" description="All-time requests by source." />
          {platformEntries.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-neutral-500">No platform traffic yet.</div>
          ) : (
            <div className="space-y-3">
              {platformEntries.map(([platform, count]) => (
                <div key={platform}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-neutral-300">{platformLabel(platform)}</span>
                    <span className="font-mono text-neutral-500">{formatNumber(count)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      style={{ width: `${Math.max(3, (count / platformMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => onNavigate('analytics')}
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950/60 py-2 text-[11px] font-semibold text-neutral-400 transition hover:text-emerald-300"
          >
            Open full analytics <ArrowUpRight className="h-3 w-3" />
          </button>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <SectionHeader
            title="Recent errors"
            description="The latest failed operations. Click logs for full details."
            action={
              <button onClick={() => onNavigate('logs')} className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300">
                View audit logs
              </button>
            }
          />
          {!analytics?.recentErrors?.length ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-5 text-xs text-emerald-300">
              <Shield className="h-4 w-4" /> No errors recorded. Nice and healthy.
            </div>
          ) : (
            <div className="space-y-2">
              {analytics.recentErrors.slice(0, 5).map(error => (
                <div key={error.id} className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                  <Badge tone={statusTone(error.status)}>{error.status}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-neutral-200">{error.error || error.input}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-neutral-600">
                      {error.platform} · {error.action} · {timeAgo(error.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Quick actions" description="Jump straight to a control surface." />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Audit logs', tab: 'logs' as AdminTab, icon: Terminal },
              { label: 'Media history', tab: 'media' as AdminTab, icon: HardDrive },
              { label: 'API sandbox', tab: 'sandbox' as AdminTab, icon: BarChart3 },
              { label: 'Security', tab: 'security' as AdminTab, icon: Shield },
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  onClick={() => onNavigate(item.tab)}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/40 px-2 py-3 text-[11px] font-semibold text-neutral-300 transition hover:border-emerald-500/30 hover:text-emerald-300"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 border-t border-neutral-800 pt-3 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Environment</span>
              <Badge tone={runtime?.environment === 'production' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}>
                {runtime?.environment || 'development'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Version</span>
              <span className="font-mono text-neutral-300">v{runtime?.version || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Database</span>
              <span className="inline-flex items-center gap-1 text-neutral-300">
                <Database className="h-3 w-3" /> {runtime?.remoteDatabase ? 'Turso/libSQL' : 'SQLite'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Node</span>
              <span className="font-mono text-neutral-300">{runtime?.nodeVersion || '—'}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader title="Runtime & database" description="Diagnostics reported by the Node process." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Database status', value: diagnostics?.database?.connected ? 'Connected' : 'Disconnected', icon: Database },
            { label: 'Database size', value: formatBytes(diagnostics?.database?.fileSizeBytes || 0), icon: HardDrive },
            { label: 'Heap used', value: `${formatNumber(diagnostics?.heapUsedMB || 0)} / ${formatNumber(diagnostics?.heapTotalMB || 0)} MB`, icon: MemoryStick },
            { label: 'Cached logs', value: formatNumber(diagnostics?.cachedLogsCount || 0), icon: Terminal },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  <Icon className="h-3 w-3" /> {item.label}
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-neutral-200">{item.value}</p>
              </div>
            );
          })}
        </div>
        {diagnostics?.database?.path && (
          <p className="mt-3 truncate rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[10px] text-neutral-600" title={diagnostics.database.path}>
            {diagnostics.database.type} · {diagnostics.database.path}
          </p>
        )}
      </Card>
    </div>
  );
};
