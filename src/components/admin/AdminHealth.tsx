import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { EndpointHealth, SystemConfig } from '../../types';
import { adminFetch } from './adminApi';
import { Badge, Card, CopyButton, EmptyState, Spinner } from './AdminUI';
import { formatDateTime } from '../../utils/format';

interface AdminHealthProps {
  token: string;
  config: SystemConfig | null;
  onSessionExpired: () => void;
  onError: (message: string) => void;
}

const STATUS_STYLES: Record<string, { tone: string; icon: React.ElementType; label: string }> = {
  online: { tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: CheckCircle2, label: 'Online' },
  degraded: { tone: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: AlertTriangle, label: 'Degraded' },
  offline: { tone: 'bg-red-500/10 text-red-300 border-red-500/20', icon: XCircle, label: 'Offline' },
  disabled: { tone: 'bg-neutral-500/10 text-neutral-400 border-neutral-700', icon: Wrench, label: 'Disabled' },
  checking: { tone: 'bg-sky-500/10 text-sky-300 border-sky-500/20', icon: Activity, label: 'Checking' },
};

export const AdminHealth: React.FC<AdminHealthProps> = ({ token, config, onSessionExpired, onError }) => {
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState('');

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch<{ success: boolean; timestamp: string; endpoints: EndpointHealth[] }>('/api/admin/health', token);
      setEndpoints(response.endpoints);
      setLastRun(response.timestamp);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') return onSessionExpired();
      onError(error.message || 'Health checks failed.');
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired, onError]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const counts = endpoints.reduce(
    (acc, endpoint) => {
      acc[endpoint.status] = (acc[endpoint.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const filtered = filter === 'all' ? endpoints : endpoints.filter(endpoint => endpoint.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Gateway health</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Probe every upstream extraction and search endpoint.{lastRun && <span className="ml-1.5 text-neutral-600">Last run {formatDateTime(lastRun)}</span>}
          </p>
        </div>
        <button
          onClick={() => void runChecks()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? 'Probing…' : 'Run checks'}
        </button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Activity className="h-4 w-4 text-emerald-400" />
          Upstream base
          <code className="rounded bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-300">{config?.baseUrl || '—'}</code>
        </div>
        <p className="text-[10px] text-neutral-600">
          Probes run server-side with an 8s timeout. Disabled NSFW endpoints are skipped.
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All', count: endpoints.length },
          { key: 'online', label: 'Online', count: counts.online || 0 },
          { key: 'degraded', label: 'Degraded', count: counts.degraded || 0 },
          { key: 'offline', label: 'Offline', count: counts.offline || 0 },
          { key: 'disabled', label: 'Disabled', count: counts.disabled || 0 },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
              filter === item.key
                ? 'border-neutral-600 bg-neutral-800 text-white'
                : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {item.label} <span className="ml-1 font-mono text-neutral-500">{item.count}</span>
          </button>
        ))}
      </div>

      {loading && endpoints.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm text-neutral-500">
          <Spinner className="h-5 w-5 text-emerald-400" /> Probing upstream endpoints… this can take a few seconds.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No endpoints in this state" description="Try another filter or run the checks again." />
      ) : (
        <div className="space-y-2">
          {filtered.map(endpoint => {
            const style = STATUS_STYLES[endpoint.status] || STATUS_STYLES.offline;
            const Icon = style.icon;
            const isExpanded = expanded === endpoint.endpoint;
            return (
              <Card key={endpoint.endpoint} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${style.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-neutral-200">{endpoint.endpoint}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                      <Badge tone={style.tone}>{style.label}</Badge>
                      <span className="font-mono">{endpoint.method}</span>
                      <span>HTTP {endpoint.statusCode || 0}</span>
                      <span className="font-mono">{endpoint.latencyMs} ms</span>
                      {endpoint.contentType && <span className="truncate">{endpoint.contentType.split(';')[0]}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {endpoint.url && <CopyButton value={endpoint.url} label="URL" />}
                    {endpoint.url && (
                      <a href={endpoint.url} target="_blank" rel="noreferrer" className="rounded-md border border-neutral-700 bg-neutral-800 p-1.5 text-neutral-400 transition hover:text-white" aria-label="Open endpoint">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {endpoint.sampleResponse && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : endpoint.endpoint)}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-[10px] font-semibold text-neutral-300 transition hover:bg-neutral-700"
                      >
                        Sample {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && endpoint.sampleResponse && (
                  <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Response preview</span>
                      <CopyButton value={endpoint.sampleResponse} label="Copy" />
                    </div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5 font-mono text-[10px] text-neutral-400">
                      {endpoint.sampleResponse}
                    </pre>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
