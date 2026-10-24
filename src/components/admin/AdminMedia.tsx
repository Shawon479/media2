import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Film,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type { MediaHistoryEntry } from '../../types';
import { adminFetch } from './adminApi';
import { SmartImage } from '../ui/SmartImage';
import {
  Badge,
  Card,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  Spinner,
  inputClass,
  selectClass,
} from './AdminUI';
import { formatDateTime, platformLabel, platformTone, timeAgo, truncate } from '../../utils/format';

interface AdminMediaProps {
  token: string;
  onSessionExpired: () => void;
  onError: (message: string) => void;
}

const PAGE_SIZE = 24;

export const AdminMedia: React.FC<AdminMediaProps> = ({ token, onSessionExpired, onError }) => {
  const [items, setItems] = useState<MediaHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<MediaHistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaHistoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextOffset = offset, quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (platform !== 'all') params.set('platform', platform);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(nextOffset));

        const response = await adminFetch<{ success: boolean; total: number; items: MediaHistoryEntry[] }>(
          `/api/admin/media?${params.toString()}`,
          token
        );
        setItems(response.items);
        setTotal(response.total);
        setOffset(nextOffset);
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') return onSessionExpired();
        onError(error.message || 'Failed to load media history.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, q, platform, offset, onSessionExpired, onError]
  );

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    void load(0);
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/media/${encodeURIComponent(deleteTarget.id)}`, token, { method: 'DELETE' });
      setItems(prev => prev.filter(item => item.id !== deleteTarget.id));
      setTotal(prev => Math.max(0, prev - 1));
      setDeleteTarget(null);
      setSelected(null);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not delete the item.');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await adminFetch('/api/admin/media', token, { method: 'DELETE' });
      setItems([]);
      setTotal(0);
      setOffset(0);
      setConfirmClear(false);
    } catch (error: any) {
      if (error?.name === 'SessionExpiredError') onSessionExpired();
      else onError(error.message || 'Could not clear media history.');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-white">Media history</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {total.toLocaleString()} resolved items stored · page {currentPage} of {totalPages}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void load(offset, true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
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
        <form onSubmit={search} className="flex flex-wrap items-end gap-2">
          <Field label="Search media" className="min-w-[200px] flex-1">
            <input value={q} onChange={event => setQ(event.target.value)} placeholder="Title, author or URL…" className={inputClass} />
          </Field>
          <Field label="Platform" className="w-[150px]">
            <select value={platform} onChange={event => setPlatform(event.target.value)} className={selectClass}>
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
            </select>
          </Field>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400">
            <Search className="h-3.5 w-3.5" /> Search
          </button>
        </form>
      </Card>

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm text-neutral-500">
          <Spinner className="h-5 w-5 text-emerald-400" /> Loading media history…
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Film} title="No media history" description="Resolved media will be recorded here for auditing and quick recall." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 text-left transition hover:border-neutral-700"
              >
                <SmartImage
                  src={item.thumbnail}
                  alt={item.title}
                  containerClassName="aspect-video w-full bg-neutral-950"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  fallbackLabel={item.title}
                />
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={platformTone(item.platform)}>{platformLabel(item.platform)}</Badge>
                    {item.duration && <span className="ml-auto font-mono text-[10px] text-neutral-500">{item.duration}</span>}
                  </div>
                  <h3 className="line-clamp-2 text-xs font-semibold text-neutral-200">{item.title}</h3>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span className="truncate">{item.author || item.mediaType || '—'}</span>
                    <span className="shrink-0">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-[11px] text-neutral-500">
            <span>Showing {offset + 1}–{Math.min(offset + items.length, total)} of {total.toLocaleString()}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="px-1 font-mono">{currentPage}/{totalPages}</span>
              <button
                onClick={() => void load(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Media item" wide>
        {selected && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-neutral-800">
              <SmartImage
                src={selected.thumbnail}
                alt={selected.title}
                containerClassName="aspect-video w-full bg-neutral-950"
                className="h-full w-full object-contain"
                fallbackLabel={selected.title}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={platformTone(selected.platform)}>{platformLabel(selected.platform)}</Badge>
                {selected.mediaType && <Badge>{selected.mediaType}</Badge>}
                {selected.duration && <Badge><Clock className="h-3 w-3" /> {selected.duration}</Badge>}
              </div>
              <h3 className="mt-2 text-base font-bold text-white">{selected.title}</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {selected.author || 'Unknown author'} · Resolved {formatDateTime(selected.createdAt)}
              </p>
            </div>

            {selected.url && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Source URL</p>
                <div className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                  <code className="min-w-0 flex-1 break-all text-[11px] text-neutral-300">{selected.url}</code>
                  <CopyButton value={selected.url} label="" />
                  <a href={selected.url} target="_blank" rel="noreferrer" className="rounded-md p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-white" aria-label="Open source">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Formats ({selected.downloads.length})</p>
              {selected.downloads.length === 0 ? (
                <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-neutral-500">No format details stored.</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {selected.downloads.map((format, index) => (
                    <div key={`${format.id}-${index}`} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-2">
                      <Download className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">{format.label}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase text-neutral-500">{format.extension}</span>
                      {format.fileSizeFormatted && <span className="shrink-0 text-[10px] text-neutral-500">{format.fileSizeFormatted}</span>}
                      <CopyButton value={format.url} label="" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setDeleteTarget(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/70">
                <Trash2 className="h-3.5 w-3.5" /> Delete item
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this media record?"
        message={`“${truncate(deleteTarget?.title || '', 80)}” will be removed from the history. The source file is not affected.`}
        confirmLabel="Delete record"
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteItem()}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear all media history?"
        message="Every resolved media record will be permanently deleted. Audit logs and telemetry counters are not affected."
        confirmLabel="Clear history"
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearAll()}
      />
    </div>
  );
};
