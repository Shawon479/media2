import React, { useState } from 'react';
import {
  Link as LinkIcon,
  Search,
  Sparkles,
  Clipboard,
  X,
  Radio,
  Video,
  Download,
  AlertCircle,
  Clock,
  Eye,
  ThumbsUp,
  User,
  ExternalLink,
  Layers,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { PlatformType, UniversalMediaItem, MediaFormat } from '../types';
import { StreamPlayer } from './StreamPlayer';
import { QualityTable } from './QualityTable';
import { safeFetchJson } from '../utils/apiHelper';
import { usePublicConfig } from '../context/ConfigContext';
import { SmartImage } from './ui/SmartImage';

interface StreamDownloaderProps {
  initialUrl?: string;
  onNavigateToTerabox?: (url: string) => void;
  onExtractionSuccess?: () => void;
}

export const StreamDownloader: React.FC<StreamDownloaderProps> = ({
  initialUrl = '',
  onNavigateToTerabox,
  onExtractionSuccess,
}) => {
  const { config } = usePublicConfig();
  const [url, setUrl] = useState(initialUrl);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('auto');
  const [preferAudio, setPreferAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaItem, setMediaItem] = useState<UniversalMediaItem | null>(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string>('');
  const [activeQualityId, setActiveQualityId] = useState<string>('');

  // Transcript state
  const [transcript, setTranscript] = useState<{ text: string; start: number; duration: number }[] | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Handle URL paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // ignore clipboard error
    }
  };

  // Perform Extraction
  const handleExtract = async (overrideUrl?: string, overridePlatform?: PlatformType) => {
    const targetUrl = (overrideUrl || url).trim();
    if (!targetUrl) return;

    // If it's a Terabox URL and user wants the dedicated Cloud manager
    if ((targetUrl.includes('1024tera.com') || targetUrl.includes('terabox.com')) && onNavigateToTerabox) {
      // allow extraction here or route to Terabox hub
    }

    setIsLoading(true);
    setError(null);

    try {
      const { ok, data: resData } = await safeFetchJson('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          platform: overridePlatform || selectedPlatform,
          preferAudio,
        }),
      });

      if (!ok || !resData.success) {
        throw new Error(resData.error || 'Failed to extract media streams from source gateway');
      }

      const item: UniversalMediaItem = resData.data;
      setMediaItem(item);
      onExtractionSuccess?.();

      // Choose default active stream URL
      const defaultStream = item.streams[0]?.url || item.streamUrl || item.downloads[0]?.url || '';
      setActiveStreamUrl(defaultStream);
      setActiveQualityId(item.streams[0]?.id || item.downloads[0]?.id || '');
    } catch (err: any) {
      setError(err.message || 'An unexpected extraction error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuality = (fmt: MediaFormat) => {
    setActiveStreamUrl(fmt.url);
    setActiveQualityId(fmt.id);
  };

  return (
    <div className="space-y-8">
      {/* Hero Extraction Bar Section */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Stream & Download Anything
            </h1>
            <p className="text-sm text-neutral-400">
              Universal media downloader for YouTube, Terabox, Instagram, TikTok, Facebook, and Pinterest.
            </p>
          </div>

          {/* Unified Input Box */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleExtract();
            }}
            className="relative flex items-center"
          >
            <div className="absolute left-3.5 text-neutral-500 pointer-events-none">
              <LinkIcon className="w-5 h-5" />
            </div>

            <input
              type="url"
              required
              placeholder="Paste media link (YouTube, Terabox, TikTok, Facebook, Instagram, Pinterest)..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700/80 rounded-xl pl-11 pr-32 py-3.5 text-sm sm:text-base text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />

            <div className="absolute right-2 flex items-center gap-1.5">
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  aria-label="Clear input"
                  className="p-1.5 text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 rounded-lg border border-neutral-700 transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>

              <button
                type="submit"
                disabled={isLoading || !url.trim()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-semibold text-xs sm:text-sm rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Fetch Media</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Platform Filter & Audio Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-neutral-400">
            {/* Platform pills */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-neutral-500 mr-1">Platform:</span>
              {(['auto', 'youtube', 'terabox', 'tiktok', 'instagram', 'facebook', 'pinterest', 'xnxx', 'xvideos', 'aio'] as PlatformType[])
                .filter(p => config.nsfwEnabled || (p !== 'xnxx' && p !== 'xvideos'))
                .map(
                p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPlatform(p)}
                    className={`px-2 py-1 rounded capitalize font-medium transition-colors ${
                      selectedPlatform === p
                        ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
                        : 'hover:text-neutral-200'
                    }`}
                  >
                    {p === 'auto' ? 'Auto-Detect' : p === 'aio' ? 'All-in-One' : p.toUpperCase()}
                  </button>
                )
              )}
            </div>

            {/* Audio Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-neutral-300 hover:text-white select-none">
              <input
                type="checkbox"
                checked={preferAudio}
                onChange={e => setPreferAudio(e.target.checked)}
                className="rounded bg-neutral-950 border-neutral-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <Radio className="w-3.5 h-3.5 text-purple-400" />
              <span>Extract MP3 Audio Only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Error Alert View */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-3 text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-white">Extraction Failed</h3>
            <p className="text-xs text-rose-300">{error}</p>
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => handleExtract(url, 'aio')}
                className="px-3 py-1 bg-rose-900/60 hover:bg-rose-900 text-rose-100 text-xs font-medium rounded border border-rose-700 transition-colors"
              >
                Retry with Universal AIO Engine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Skeleton View */}
      {isLoading && (
        <div className="border border-neutral-800 rounded-2xl p-6 bg-neutral-900/30 space-y-4 animate-pulse">
          <div className="h-6 bg-neutral-800 rounded w-1/3" />
          <div className="aspect-video bg-neutral-800/60 rounded-xl max-w-2xl mx-auto flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono">Contacting media processing gateway...</span>
            </div>
          </div>
          <div className="h-10 bg-neutral-800 rounded w-full" />
        </div>
      )}

      {/* Extracted Result Viewport */}
      {mediaItem && !isLoading && (
        <div className="space-y-6">
          {/* Media Header Info Card */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4">
            {mediaItem.thumbnail && (
              <SmartImage
                src={mediaItem.thumbnail}
                alt={mediaItem.title}
                className="w-full h-full object-cover"
                containerClassName="w-full sm:w-44 aspect-video sm:aspect-square sm:w-28 rounded-lg border border-neutral-800 shrink-0 bg-neutral-950 overflow-hidden"
                fallbackLabel={mediaItem.title}
              />
            )}

            <div className="flex-1 space-y-2 w-full min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase">
                  {mediaItem.platform}
                </span>
                <span className="text-xs text-neutral-400 font-medium">
                  {mediaItem.mediaType.toUpperCase()}
                </span>
              </div>

              <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2">
                {mediaItem.title}
              </h2>

              {/* Unboxed Metadata (Rule: No Pill Enclosures) */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                {mediaItem.author && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="text-neutral-200 font-medium">{mediaItem.author}</span>
                  </span>
                )}
                {mediaItem.duration && (
                  <>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-mono tabular-nums">{mediaItem.duration}</span>
                    </span>
                  </>
                )}
                {mediaItem.views && (
                  <>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-mono tabular-nums">{Number(mediaItem.views).toLocaleString()} views</span>
                    </span>
                  </>
                )}
                {mediaItem.likes && (
                  <>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-mono tabular-nums">{Number(mediaItem.likes).toLocaleString()} likes</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Media Player Section */}
          {activeStreamUrl && (
            <div className="space-y-3">
              <StreamPlayer
                title={mediaItem.title}
                poster={mediaItem.thumbnail}
                streamUrl={activeStreamUrl}
                isAudioOnly={mediaItem.mediaType === 'audio'}
                qualities={mediaItem.streams}
                activeQualityId={activeQualityId}
                onSelectQuality={handleSelectQuality}
              />
            </div>
          )}

          {/* YouTube Transcript Module (if YouTube media) */}
          {mediaItem.platform === 'youtube' && (
            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Video Transcript & Closed Captions</h3>
                </div>

                <div className="flex items-center gap-2">
                  {!transcript ? (
                    <button
                      onClick={async () => {
                        setIsLoadingTranscript(true);
                        setTranscriptError(null);
                        try {
                          const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(mediaItem.sourceUrl)}`);
                          const json = await res.json();
                          if (!res.ok || !json.success) {
                            throw new Error(json.error || 'Transcript unavailable for this video');
                          }
                          setTranscript(json.data.transcript || []);
                          setShowTranscript(true);
                        } catch (err: any) {
                          setTranscriptError(err.message || 'Transcript extraction failed');
                        } finally {
                          setIsLoadingTranscript(false);
                        }
                      }}
                      disabled={isLoadingTranscript}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-neutral-700 transition-colors flex items-center gap-1.5"
                    >
                      {isLoadingTranscript ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          <span>Extracting Subtitles...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          <span>Fetch Transcript</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                    >
                      {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                    </button>
                  )}
                </div>
              </div>

              {transcriptError && (
                <p className="text-xs text-rose-400">{transcriptError}</p>
              )}

              {showTranscript && transcript && (
                <div className="space-y-3 pt-2 border-t border-neutral-800">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Search within speech transcript..."
                      value={transcriptSearch}
                      onChange={e => setTranscriptSearch(e.target.value)}
                      className="w-full sm:w-64 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />

                    <button
                      onClick={() => {
                        const fullText = transcript.map(t => `[${Math.floor(t.start)}s] ${t.text}`).join('\n');
                        navigator.clipboard.writeText(fullText);
                        setCopiedTranscript(true);
                        setTimeout(() => setCopiedTranscript(false), 2000);
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors flex items-center gap-1 shrink-0"
                    >
                      {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTranscript ? 'Copied' : 'Copy Text'}</span>
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-xs divide-y divide-neutral-800/40 font-mono">
                    {transcript
                      .filter(item => !transcriptSearch || item.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
                      .map((item, idx) => {
                        const m = Math.floor(item.start / 60);
                        const s = Math.floor(item.start % 60);
                        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

                        return (
                          <div key={idx} className="pt-1.5 flex items-start gap-2.5 hover:bg-neutral-800/30 p-1 rounded">
                            <span className="text-emerald-400 font-semibold tabular-nums select-none shrink-0">
                              {timeStr}
                            </span>
                            <span className="text-neutral-200 font-sans leading-relaxed">
                              {item.text}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Image Gallery Mode (if Pinterest or photo carousel) */}
          {mediaItem.mediaType === 'gallery' && mediaItem.galleryImages && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Extracted Image Gallery</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {mediaItem.galleryImages.map((imgUrl, i) => (
                  <div key={i} className="group relative rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 aspect-square">
                    <img
                      src={imgUrl}
                      alt={`Gallery item ${i + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                      <a
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-neutral-900/90 text-white rounded-lg hover:bg-neutral-800"
                        title="View Full Resolution"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <a
                        href={`/api/proxy-download?url=${encodeURIComponent(imgUrl)}&filename=pin_${i + 1}.jpg`}
                        download={`pin_${i + 1}.jpg`}
                        className="p-2 bg-emerald-500 text-neutral-950 rounded-lg hover:bg-emerald-400"
                        title="Download Image"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quality Formats Table */}
          <QualityTable
            mediaTitle={mediaItem.title}
            formats={mediaItem.downloads}
            activeStreamUrl={activeStreamUrl}
            onPlayFormat={handleSelectQuality}
          />
        </div>
      )}
    </div>
  );
};
