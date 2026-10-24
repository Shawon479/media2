import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Globe2,
  HardDrive,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import type { AdminAnalytics as AdminAnalyticsData } from '../../types';
import { adminFetch, downloadJson } from './adminApi';
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  SectionHeader,
  Spinner,
  TrafficChart,
} from './AdminUI';
import { formatNumber, platformLabel, statusTone, timeAgo, truncate } from '../../utils/format';

interface AdminAnalyticsProps {
  token: string;
  onSessionExpired: () => void;
  onError: (message: string) => void;
}

const RANGES = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
];

export const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({ token, onSessionExpired, onError }) => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const response = await adminFetch<AdminAnalyticsData & { success: boolean }>(`/api/admin/analytics?hours=${hours}`, token);
        setData(response);
        setLastUpdated(new Date().toISOString());
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') return onSessionExpired();
        onError(error.message || 'Failed to load analytics.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hours, token, onSessionExpired, onError]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totalRequests = data?.series?.reduce((sum, point) => sum + point.requests, 0) || 0;
  const totalErrors = data?.series?.reduce((sum, point) => sum + point.errors, 0) || 0;
  const peak = Math.max(1, ...(data?.series || []).map(point => point.requests));

  const namedList = (
    title: string,
    description: string,
    items: Array<{ name: string; count: number }>,
    icon: React.ElementType,
    formatter?: (name: string) => string
  ) => {
    const Icon = icon;
    return (
      <Card className="p-4">
        <SectionHeader title={title} description={description} />
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">No data in this range.</p>
        ) : (
          <div className="space-y-2.5">
            {items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[10px] text-neutral-600">{index + 1}</span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-300" title={item.name}>
                  {formatter ? formatter(item.name) : item.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-neutral-500">{formatNumber(item.count)}</span>
                {item.name.startsWith('http') && <CopyButton value={item.name} label="" className="shrink-0 px-1.5" />}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Analytics</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Request trends, top sources and media resolution activity.{lastUpdated && <span className="ml-1.5 text-neutral-600">Updated {timeAgo(lastUpdated)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
            {RANGES.map(range => (
              <button
                key={range.hours}
                onClick={() => setHours(range.hours)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  hours === range.hours ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            onClick={() => data && downloadJson(`streampulse_analytics_${hours}h.json`, { exportedAt: new Date().toISOString(), hours, ...data })}
            disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-neutral-500">
          <Spinner className="h-5 w-5 text-emerald-400" /> Crunching numbers…
        </div>
      ) : !data ? (
        <EmptyState title="Analytics unavailable" description="No analytics response was returned." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Window requests', value: formatNumber(totalRequests), icon: BarChart3 },
              { label: 'Window errors', value: formatNumber(totalErrors), icon: Search },
              { label: 'Peak per hour', value: formatNumber(peak), icon: RefreshCw },
              { label: 'Top inputs tracked', value: formatNumber(data.topInputs.length), icon: Globe2 },
            ].map(item => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    <Icon className="h-3 w-3" /> {item.label}
                  </div>
                  <p className="mt-1 text-xl font-extrabold tabular-nums text-white">{item.value}</p>
                </Card>
              );
            })}
          </div>

          <Card className="p-4">
            <SectionHeader
              title={`Traffic trend · ${RANGES.find(range => range.hours === hours)?.label}`}
              description="Requests are aggregated into hourly buckets (UTC)."
              action={
                <div className="flex gap-2">
                  <Badge tone="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">{formatNumber(totalRequests)} requests</Badge>
                  <Badge tone="bg-red-500/10 text-red-300 border-red-500/20">{formatNumber(totalErrors)} errors</Badge>
                </div>
              }
            />
            <TrafficChart series={data.series} height={220} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {namedList('Top platforms', 'Request volume by detected platform (7 days).', data.topPlatforms, Globe2, platformLabel)}
            {namedList('Top actions', 'Extraction, streaming, downloads, search and admin activity.', data.topActions, BarChart3)}
            {namedList('Top requested inputs', 'Most frequently submitted URLs or search queries (7 days).', data.topInputs, Globe2, name => truncate(name, 72))}
            {namedList('Top clients', 'Request counts by IP address (7 days).', data.topClients, Users, name => (name === 'unknown' ? 'Unknown IP' : name))}
            {namedList('Media history by platform', 'Resolved media items saved in the database (7 days).', data.mediaSummary, HardDrive, platformLabel)}
            <Card className="p-4">
              <SectionHeader title="Latest errors" description="Most recent failed operations." />
              {data.recentErrors.length === 0 ? (
                <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-6 text-center text-xs text-emerald-300">
                  No errors recorded.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.recentErrors.slice(0, 8).map(error => (
                    <div key={error.id} className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={statusTone(error.status)}>{error.status}</Badge>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{error.platform}</span>
                        <span className="ml-auto text-[10px] text-neutral-600">{timeAgo(error.timestamp)}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-neutral-300" title={error.error || error.input}>
                        {error.error || error.input}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
