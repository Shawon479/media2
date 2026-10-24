import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Folder,
  Video,
  Image as ImageIcon,
  Play,
  Download,
  Search,
  ExternalLink,
  Sparkles,
  AlertCircle,
  FileText,
  Filter,
} from 'lucide-react';
import { TeraboxFile, UniversalMediaItem, MediaFormat } from '../types';
import { StreamPlayer } from './StreamPlayer';
import { usePublicConfig } from '../context/ConfigContext';
import { SmartImage } from './ui/SmartImage';

interface TeraboxHubProps {
  defaultUrl?: string;
}

export const TeraboxHub: React.FC<TeraboxHubProps> = ({ defaultUrl = '' }) => {
  const { config } = usePublicConfig();
  const [url, setUrl] = useState(defaultUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teraboxData, setTeraboxData] = useState<UniversalMediaItem | null>(null);
  const [activeFile, setActiveFile] = useState<TeraboxFile | null>(null);
  const [fileFilter, setFileFilter] = useState<'all' | 'video' | 'photo'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTerabox = async (targetUrl = url) => {
    if (!targetUrl.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim(), platform: 'terabox' }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch Terabox cloud folder');
      }

      setTeraboxData(json.data);
      const files: TeraboxFile[] = json.data.teraboxData?.files || [];
      const firstPlayable = files.find(f => f.category === 'video' || f.filename?.endsWith('.mp4')) || files[0];
      if (firstPlayable) {
        setActiveFile(firstPlayable);
      }
    } catch (err: any) {
      setError(err.message || 'Error resolving Terabox shared link');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if a non-empty URL was explicitly passed in
    if (defaultUrl && defaultUrl.trim()) {
      fetchTerabox(defaultUrl);
    }
  }, [defaultUrl]);

  const files = teraboxData?.teraboxData?.files || [];
  const filteredFiles = files.filter(f => {
    if (fileFilter !== 'all' && f.category !== fileFilter) return false;
    if (searchQuery && !f.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Ingestion Box */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Terabox Cloud Streamer
              </h1>
              <p className="text-xs text-neutral-400">
                Stream 1024tera & Terabox cloud links directly in browser without installing apps.
              </p>
            </div>
          </div>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={e => {
            e.preventDefault();
            fetchTerabox();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="url"
            required
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste 1024tera / terabox shared link..."
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Unpack Cloud</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-3 text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-white">Terabox Error</h3>
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        </div>
      )}

      {/* Loaded Content */}
      {teraboxData && (
        <div className="space-y-6">
          {/* Cloud Folder Stats & Directory path */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">
                  {teraboxData.teraboxData?.rootPath || teraboxData.title}
                </span>
              </div>
              {/* Unboxed metadata */}
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span>{teraboxData.teraboxData?.totals?.items || files.length} total items</span>
                <span aria-hidden="true">·</span>
                <span>{teraboxData.teraboxData?.totals?.videos || 0} videos</span>
                <span aria-hidden="true">·</span>
                <span>{teraboxData.teraboxData?.totals?.photos || 0} photos</span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Search in files */}
              <div className="relative flex-1 md:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Segmented Category Buttons */}
              <div className="flex items-center gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded-lg shrink-0">
                {(['all', 'video', 'photo'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFileFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors ${
                      fileFilter === cat
                        ? 'bg-neutral-800 text-emerald-400'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active File Player */}
          {activeFile && activeFile.streamUrl && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white truncate max-w-lg">
                    Now Playing: {activeFile.filename}
                  </span>
                  <span className="text-xs font-mono text-neutral-400 tabular-nums">
                    ({activeFile.sizeFormatted})
                  </span>
                </div>
              </div>

              <StreamPlayer
                title={activeFile.filename}
                poster={activeFile.thumbnail}
                streamUrl={activeFile.streamUrl}
                isAudioOnly={false}
              />
            </div>
          )}

          {/* File Explorer Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Folder Contents ({filteredFiles.length} files)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredFiles.map(file => {
                const isSelected = activeFile?.fsId === file.fsId;
                const isVideo = file.category === 'video' || file.filename.endsWith('.mp4');

                return (
                  <div
                    key={file.fsId}
                    className={`rounded-xl border p-3 flex flex-col justify-between gap-3 transition-all ${
                      isSelected
                        ? 'bg-neutral-900 border-emerald-500/60 shadow-lg'
                        : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/80'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail or Fallback Icon */}
                      <div className="w-16 h-16 rounded-lg bg-neutral-950 border border-neutral-800 shrink-0 overflow-hidden flex items-center justify-center relative">
                        {file.thumbnail ? (
                          <SmartImage
                            src={file.thumbnail}
                            alt={file.filename}
                            className="w-full h-full object-cover"
                            containerClassName="w-full h-full"
                            fallbackLabel={file.filename}
                          />
                        ) : isVideo ? (
                          <Video className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-sky-400" />
                        )}
                        {isVideo && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-white text-white drop-shadow" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate" title={file.filename}>
                          {file.filename}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-400 tabular-nums pt-0.5">
                          {file.sizeFormatted}
                        </p>
                        <span className="inline-block mt-1 text-[10px] uppercase font-bold text-neutral-500">
                          {file.category}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-neutral-800/60">
                      {isVideo && file.streamUrl && (
                        <button
                          onClick={() => setActiveFile(file)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                            isSelected
                              ? 'bg-emerald-500 text-neutral-950 font-semibold'
                              : 'bg-neutral-800 text-emerald-400 hover:bg-neutral-700'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Stream</span>
                        </button>
                      )}

                      {file.streamUrl && config.downloadsEnabled && (
                        <a
                          href={`/api/proxy-download?url=${encodeURIComponent(file.streamUrl)}&filename=${encodeURIComponent(file.filename)}`}
                          download={file.filename}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors flex items-center gap-1"
                          title="Download File"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Get</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
