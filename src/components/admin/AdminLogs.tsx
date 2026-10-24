import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { LogEntry } from '../../types';
import { adminFetch } from './adminApi';
import {
  Badge,
  Card,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  SectionHeader,
  Spinner,
  inputClass,
  selectClass,
} from './AdminUI';
import { formatDateTime, statusTone, timeAgo, toCsv, truncate } from '../../utils/format';

interface AdminLogsProps {
  token: string;
  onSessionExpired: () => void;
  onError: (message: string) => void;
}

interface Filters {
  q: string;
  platform: string;
  action: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: '', platform: 'all', action: 'all', status: 'all', from: '', to: '' };
const PAGE_SIZE = 100;

export const AdminLogs: React.FC<AdminLogsProps> = ({ token, onSessionExpired, onError }) => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LogEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [pruneDays, setPruneDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const buildQuery = useCallback((current: Filters, nextOffset: number) => {
    const params = new URLSearchParams();
    if (current.q.trim()) params.set('q', current.q.trim());
    if (current.platform !== 'all') params.set('platform', current.platform);
    if (current.action !== 'all') params.set('action', current.action);
    if (current.status !== 'all') params.set('status', current.status);
    if (current.from) params.set('from', new Date(current.from).toISOString());
    if (current.to) params.set('to', new Date(current.to).toISOString());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(nextOffset));
    return params.toString();
  }, []);

  const load = useCallback(
    async (nextOffset = offset, currentFilters = applied, quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const response = await adminFetch<{ success: boolean; total: number; logs: LogEntry[] }>(
          `/api/admin/logs?${buildQuery(currentFilters, nextOffset)}`,
          token
        );
        setLogs(response.logs);
        setTotal(response.total);
        setOffset(nextOffset);
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') return onSessionExpired();
        onError(error.message || 'Failed to load logs.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, offset, applied, buildQuery, onSessionExpired, onError]
  );

  useEffect(() => {
    void load(0, EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied(filters);
    void load(0, filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    void load(0, EMPTY_FILTERS);
  };

  const deleteLog = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/logs/${encodeURIComponent(deleteTarget.id)}`, token, { method: 'DELETE' });
      setLogs(prev => prev.filter(log => log.id !== deleteTarget.id));
      setTotal(prev => Math.max(0, prev - 1));
      setDeleteTarget(null);
      setSelected(null);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not delete the log entry.');
    } finally {
      setBusy(false);
    }
  };

  const clearLogs = async () => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/logs', token, { method: 'DELETE' });
      setLogs([]);
      setTotal(0);
      setOffset(0);
      setConfirmClear(false);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not clear logs.');
    } finally {
      setBusy(false);
    }
  };

  const pruneLogs = async () => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/logs/prune', token, {
        method: 'POST',
        body: { days: pruneDays },
      });
      setPruneOpen(false);
      await load(0, applied, true);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not prune logs.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const csv = toCsv(
      logs.map(log => ({
        timestamp: log.timestamp,
        platform: log.platform,
        action: log.action,
        status: log.status,
        latencyMs: log.latencyMs,
        clientIp: log.clientIp,
        input: log.input,
        error: log.error,
        requestId: log.requestId,
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `streampulse_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const activeFilterCount = useMemo(
    () =>
      [applied.q, applied.platform !== 'all', applied.action !== 'all', applied.status !== 'all', applied.from, applied.to].filter(Boolean)
        .length,
    [applied]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Audit logs</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {total.toLocaleString()} events recorded · page {currentPage} of {totalPages}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void load(offset, applied, true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => setPruneOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700"
          >
            <Scissors className="h-3.5 w-3.5" /> Prune
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/70"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </button>
        </div>
      </div>

      <Card className="p-3">
        <form onSubmit={submitFilters} className="flex flex-wrap items-end gap-2">
          <Field label="Search" className="min-w-[180px] flex-1">
            <input
              value={filters.q}
              onChange={event => setFilters({ ...filters, q: event.target.value })}
              placeholder="URL, IP, error or request ID…"
              className={inputClass}
            />
          </Field>
          <Field label="Platform" className="w-[130px]">
            <select value={filters.platform} onChange={event => setFilters({ ...filters, platform: event.target.value })} className={selectClass}>
              <option value="all">All</option>
              <option value="youtube">YouTube</option>
              <option value="terabox">Terabox</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="pinterest">Pinterest</option>
              <option value="xnxx">XNXX</option>
              <option value="xvideos">Xvideos</option>
              <option value="aio">Universal</option>
              <option value="system">System</option>
            </select>
          </Field>
          <Field label="Action" className="w-[120px]">
            <select value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value })} className={selectClass}>
              <option value="all">All</option>
              <option value="extract">Extract</option>
              <option value="stream">Stream</option>
              <option value="download">Download</option>
              <option value="search">Search</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Status" className="w-[110px]">
            <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} className={selectClass}>
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="error">Errors</option>
            </select>
          </Field>
          <Field label="From" className="w-[175px]">
            <input type="datetime-local" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} className={inputClass} />
          </Field>
          <Field label="To" className="w-[175px]">
            <input type="datetime-local" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} className={inputClass} />
          </Field>
          <div className="flex gap-2 pb-0.5">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400">
              <Filter className="h-3.5 w-3.5" /> Apply
            </button>
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters} className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-700">
                Reset
              </button>
            )}
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm text-neutral-500">
          <Spinner className="h-5 w-5 text-emerald-400" /> Loading audit trail…
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={FileText} title="No matching logs" description={activeFilterCount > 0 ? 'Try widening your filters.' : 'Activity will appear here as visitors use the gateway.'} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/70 text-[10px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold">Platform</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Latency</th>
                  <th className="px-3 py-2.5 font-semibold">Client IP</th>
                  <th className="px-3 py-2.5 font-semibold">Input</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70">
                {logs.map(log => (
                  <tr key={log.id} className="transition hover:bg-neutral-900/50">
                    <td className="whitespace-nowrap px-3 py-2.5 text-neutral-400" title={formatDateTime(log.timestamp)}>
                      {timeAgo(log.timestamp)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge>{log.platform}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-300">{log.action}</td>
                    <td className="px-3 py-2.5"><Badge tone={statusTone(log.status)}>{log.status}</Badge></td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-neutral-400">{log.latencyMs}ms</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-neutral-500">{log.clientIp || '—'}</td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <span className="block truncate text-neutral-300" title={log.input}>{truncate(log.input, 64)}</span>
                      {log.error && <span className="block truncate text-[10px] text-red-400/80" title={log.error}>{truncate(log.error, 60)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button onClick={() => setSelected(log)} className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-800 hover:text-emerald-300" title="View details">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(log)} className="rounded-md p-1.5 text-neutral-500 transition hover:bg-red-950/50 hover:text-red-300" title="Delete log">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 px-3 py-2.5 text-[11px] text-neutral-500">
            <span>
              Showing {offset + 1}–{Math.min(offset + logs.length, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void load(Math.max(0, offset - PAGE_SIZE), applied)}
                disabled={offset === 0}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="px-1 font-mono">{currentPage}/{totalPages}</span>
              <button
                onClick={() => void load(offset + PAGE_SIZE, applied)}
                disabled={offset + PAGE_SIZE >= total}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Log entry detail" wide>
        {selected && (
          <div className="space-y-3 text-xs">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Timestamp', formatDateTime(selected.timestamp)],
                ['Platform', selected.platform],
                ['Action', selected.action],
                ['Status', String(selected.status)],
                ['Latency', `${selected.latencyMs} ms`],
                ['Client IP', selected.clientIp || '—'],
                ['Request ID', selected.requestId || '—'],
                ['Log ID', selected.id],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{label}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-neutral-300">{value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Input</p>
              <div className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                <code className="min-w-0 flex-1 break-all text-[11px] text-neutral-300">{selected.input}</code>
                <CopyButton value={selected.input} label="" />
              </div>
            </div>
            {selected.userAgent && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">User agent</p>
                <p className="break-all rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[10px] text-neutral-400">{selected.userAgent}</p>
              </div>
            )}
            {selected.payloadSummary && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Payload summary</p>
                <pre className="whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-[10px] text-neutral-400">{selected.payloadSummary}</pre>
              </div>
            )}
            {selected.error && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-500">Error</p>
                <pre className="whitespace-pre-wrap break-all rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 font-mono text-[10px] text-red-300">{selected.error}</pre>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => setDeleteTarget(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/70">
                <Trash2 className="h-3.5 w-3.5" /> Delete entry
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this log entry?"
        message="This permanently removes the selected audit record. It cannot be undone."
        confirmLabel="Delete entry"
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteLog()}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear the entire audit log?"
        message="Every recorded request, admin action and error will be permanently deleted. Consider exporting a CSV first."
        confirmLabel="Clear all logs"
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearLogs()}
      />

      <Modal
        open={pruneOpen}
        onClose={() => setPruneOpen(false)}
        title="Prune old logs"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setPruneOpen(false)} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200">Cancel</button>
            <button onClick={() => void pruneLogs()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50">
              {busy && <Spinner />} Prune logs
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-neutral-400">
          <p>Delete audit records older than the selected number of days. This keeps the database lean on busy deployments.</p>
          <Field label="Retain logs for (days)">
            <input
              type="number"
              min={1}
              max={3650}
              value={pruneDays}
              onChange={event => setPruneDays(Math.max(1, Math.min(3650, Number(event.target.value) || 1)))}
              className={inputClass}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
