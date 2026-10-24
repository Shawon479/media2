import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Clock,
  Play,
  RotateCw,
  Film,
  User,
  ExternalLink,
  Layers,
} from 'lucide-react';
import type { MediaHistoryEntry, PlatformType } from '../types';
import { SmartImage } from './ui/SmartImage';
import { timeAgo } from '../utils/format';

interface RecentlyResolvedProps {
  onSelectMedia?: (url: string) => void;
  onSearchQuery?: (query: string, platform?: string) => void;
  refreshTrigger?: number;
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  youtube: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  tiktok: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  instagram: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
  facebook: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  terabox: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  pinterest: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  aio: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
};

export const RecentlyResolved: React.FC<RecentlyResolvedProps> = ({
  onSelectMedia,
  onSearchQuery,
  refreshTrigger,
}) => {
  const [items, setItems] = useState<MediaHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchHistory = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const response = await fetch('/api/media-history?limit=10', {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
        }
      }
    } catch {
      // Gracefully handle network issues
    } finally {
      setIsLoading(false);
      setIsManualRefreshingFalse();
    }
    function setIsManualRefreshingFalse() {
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-800" />
          <div className="h-5 w-16 animate-pulse rounded bg-neutral-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 pt-4" aria-label="Recently Resolved Media">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm font-bold tracking-tight text-white sm:text-base">
            Recently Resolved Media
          </h2>
          <span className="hidden rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-neutral-400 sm:inline">
            Public feed
          </span>
        </div>

        <button
          onClick={() => void fetchHistory(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:border-neutral-700 hover:text-white disabled:opacity-50"
          title="Refresh recently resolved media"
          aria-label="Refresh recently resolved media"
        >
          <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map(item => {
          const color = PLATFORM_COLORS[item.platform.toLowerCase()] || {
            bg: 'bg-neutral-800',
            text: 'text-neutral-300',
            border: 'border-neutral-700',
          };

          return (
            <div
              key={item.id}
              onClick={() => {
                if (item.url && onSelectMedia) {
                  onSelectMedia(item.url);
                } else if (onSearchQuery) {
                  onSearchQuery(item.title, item.platform);
                }
              }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-2.5 transition-all hover:-translate-y-0.5 hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-lg hover:shadow-emerald-500/5 cursor-pointer"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-950">
                <SmartImage
                  src={item.thumbnail}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  containerClassName="h-full w-full"
                  fallbackLabel={item.title}
                />

                {/* Duration Badge */}
                {item.duration && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-200 backdrop-blur-xs">
                    {item.duration}
                  </span>
                )}

                {/* Platform Badge */}
                <span
                  className={`absolute left-1.5 top-1.5 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-xs ${color.bg} ${color.text} ${color.border}`}
                >
                  {item.platform}
                </span>

                {/* Hover Play Glow */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-neutral-950 shadow-md transition-transform group-hover:scale-110">
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Title & Metadata */}
              <div className="mt-2 space-y-1">
                <h3
                  className="line-clamp-2 text-xs font-semibold leading-snug text-neutral-200 transition-colors group-hover:text-emerald-400"
                  title={item.title}
                >
                  {item.title}
                </h3>

                <div className="flex items-center justify-between text-[10px] text-neutral-500">
                  {item.author ? (
                    <span className="truncate max-w-[90px]" title={item.author}>
                      {item.author}
                    </span>
                  ) : (
                    <span className="capitalize">{item.mediaType || 'media'}</span>
                  )}

                  {item.createdAt && (
                    <span className="shrink-0">{timeAgo(item.createdAt)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
