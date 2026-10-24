import React, { useState } from 'react';
import {
  Search,
  Video,
  Image as ImageIcon,
  Play,
  Download,
  User,
  AlertCircle,
  Flame,
  X,
  Sparkles,
  Square,
} from 'lucide-react';
import { UniversalMediaItem, MediaFormat } from '../types';
import { StreamPlayer } from './StreamPlayer';
import { safeFetchJson } from '../utils/apiHelper';
import { usePublicConfig } from '../context/ConfigContext';
import { SmartImage } from './ui/SmartImage';

interface ExploreSearchProps {
  onSelectMedia: (url: string) => void;
}

type SearchCategory = 'youtube' | 'pinterest' | 'xnxx' | 'xvideos';

const PRESET_QUERIES: Record<SearchCategory, { label: string; query: string }[]> = {
  youtube: [
    { label: 'Tropical Chill', query: 'Tropical Deep House 2026' },
    { label: 'Nature 4K', query: 'Nature relaxing drone 4K' },
    { label: 'Lofi Beats', query: 'Lofi hip hop beats relax study' },
    { label: 'Acoustic Pop', query: 'Trending acoustic pop songs' },
  ],
  pinterest: [
    { label: 'Anime Aesthetics', query: 'Cyberpunk Anime Wallpaper' },
    { label: 'Minimalist Architecture', query: 'Modern architecture interior' },
    { label: 'Nature Photography', query: 'Dark forest moody aesthetic' },
    { label: 'Fashion Lookbook', query: 'Streetwear fashion outfit ideas' },
  ],
  xnxx: [
    { label: 'Trending Dance', query: 'dance' },
    { label: 'Romance', query: 'romance' },
    { label: 'Glamour', query: 'glamour' },
  ],
  xvideos: [
    { label: 'Trending Dance', query: 'dance' },
    { label: 'Model Showcase', query: 'model' },
    { label: 'Fitness', query: 'fitness' },
  ],
};

export const ExploreSearch: React.FC<ExploreSearchProps> = ({ onSelectMedia }) => {
  const { config } = usePublicConfig();
  const [searchType, setSearchType] = useState<SearchCategory>('youtube');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-switch away from NSFW if disabled
  React.useEffect(() => {
    if (!config.nsfwEnabled && (searchType === 'xnxx' || searchType === 'xvideos')) {
      setSearchType('youtube');
    }
  }, [config.nsfwEnabled, searchType]);

  // Search Results
  const [youtubeResults, setYoutubeResults] = useState<any[]>([]);
  const [pinterestResults, setPinterestResults] = useState<string[]>([]);
  const [nsfwResults, setNsfwResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // In-Card Stream Player State
  const [loadingCardKey, setLoadingCardKey] = useState<string | null>(null);
  const [playingCardKey, setPlayingCardKey] = useState<string | null>(null);
  const [cardStreamUrl, setCardStreamUrl] = useState<string | null>(null);
  const [cardStreamsMap, setCardStreamsMap] = useState<Record<string, MediaFormat[]>>({});
  const [cardStreamError, setCardStreamError] = useState<Record<string, string>>({});

  const handleSearch = async (targetQuery = query, targetType = searchType) => {
    const q = targetQuery.trim();
    if (!q) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    // Reset playing state when searching
    setPlayingCardKey(null);
    setCardStreamUrl(null);

    try {
      const { ok, data: json } = await safeFetchJson(`/api/search?type=${targetType}&q=${encodeURIComponent(q)}`);

      if (!ok || !json.success) {
        throw new Error(json.error || 'Search query failed');
      }

      const results = json.data || [];
      if (targetType === 'youtube') {
        setYoutubeResults(Array.isArray(results) ? results : []);
      } else if (targetType === 'pinterest') {
        setPinterestResults(Array.isArray(results) ? results : []);
      } else {
        setNsfwResults(Array.isArray(results) ? results : []);
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with search API');
    } finally {
      setIsLoading(false);
    }
  };

  // Extract stream directly inside the result card
  const handleStartInCardStream = async (cardKey: string, mediaUrl: string, platform: string) => {
    if (playingCardKey === cardKey) {
      setPlayingCardKey(null);
      setCardStreamUrl(null);
      return;
    }

    setLoadingCardKey(cardKey);
    setCardStreamError(prev => ({ ...prev, [cardKey]: '' }));

    try {
      const { ok, data: resData } = await safeFetchJson('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mediaUrl,
          platform: platform === 'youtube' ? 'youtube' : platform === 'xnxx' ? 'xnxx' : platform === 'xvideos' ? 'xvideos' : 'auto',
        }),
      });

      if (!ok || !resData.success) {
        throw new Error(resData.error || 'Failed to extract video stream');
      }

      const item: UniversalMediaItem = resData.data;
      const defaultStream = item.streams[0]?.url || item.streamUrl || item.downloads[0]?.url || '';

      if (!defaultStream) {
        throw new Error('No stream URL available for this video');
      }

      setCardStreamUrl(defaultStream);
      setCardStreamsMap(prev => ({ ...prev, [cardKey]: item.streams || [] }));
      setPlayingCardKey(cardKey);
    } catch (err: any) {
      setCardStreamError(prev => ({
        ...prev,
        [cardKey]: err.message || 'Unable to play stream directly in card.',
      }));
    } finally {
      setLoadingCardKey(null);
    }
  };

  if (!config.searchEnabled) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Search Hub Disabled</h2>
        <p className="max-w-md mx-auto text-sm text-neutral-400">
          Media exploration and search queries have been paused by the deployment administrator. You can still stream and download any direct media link using the Stream & Download tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Header & Bar */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Media Discovery Hub
              </h1>
              <p className="text-xs text-neutral-400">
                Stream videos directly in search results or click Download Options to forward to the full Stream Downloader.
              </p>
            </div>
          </div>

          {/* Engine Selector */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded-lg self-start sm:self-center">
            <button
              onClick={() => {
                setSearchType('youtube');
                if (query) handleSearch(query, 'youtube');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                searchType === 'youtube'
                  ? 'bg-neutral-800 text-emerald-400 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>YouTube</span>
            </button>

            <button
              onClick={() => {
                setSearchType('pinterest');
                if (query) handleSearch(query, 'pinterest');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                searchType === 'pinterest'
                  ? 'bg-neutral-800 text-emerald-400 font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Pinterest</span>
            </button>

            {config.nsfwEnabled && (
              <>
                <button
                  onClick={() => {
                    setSearchType('xnxx');
                    if (query) handleSearch(query, 'xnxx');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    searchType === 'xnxx'
                      ? 'bg-neutral-800 text-rose-400 font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>XNXX (18+)</span>
                </button>

                <button
                  onClick={() => {
                    setSearchType('xvideos');
                    if (query) handleSearch(query, 'xvideos');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    searchType === 'xvideos'
                      ? 'bg-neutral-800 text-rose-400 font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Xvideos (18+)</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-500" />
            <input
              type="text"
              required
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${searchType.toUpperCase()} for videos, clips, visuals...`}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-semibold text-sm rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <span>Search</span>
            )}
          </button>
        </form>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-neutral-500">Popular:</span>
          {(PRESET_QUERIES[searchType] || []).map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setQuery(p.query);
                handleSearch(p.query, searchType);
              }}
              className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700/60 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-3 text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-white">Search Notice</h3>
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        </div>
      )}

      {/* YouTube Results Grid */}
      {searchType === 'youtube' && youtubeResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              YouTube Video Results ({youtubeResults.length} matches)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {youtubeResults.map((item, idx) => {
              const cardKey = `yt_${item.link || idx}`;
              const isPlaying = playingCardKey === cardKey && cardStreamUrl;
              const isLoadingStream = loadingCardKey === cardKey;
              const cardErr = cardStreamError[cardKey];

              return (
                <div
                  key={cardKey}
                  className="bg-neutral-900/40 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-all flex flex-col justify-between group"
                >
                  {/* Thumbnail OR Direct StreamPlayer */}
                  <div className="relative aspect-video bg-neutral-950 overflow-hidden">
                    {isPlaying ? (
                      <div className="relative w-full h-full bg-black">
                        <button
                          onClick={() => {
                            setPlayingCardKey(null);
                            setCardStreamUrl(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/80 hover:bg-neutral-800 text-white rounded-full transition-colors z-30 shadow-lg border border-neutral-700"
                          title="Close Stream"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <StreamPlayer
                          title={item.title}
                          poster={item.imageUrl}
                          streamUrl={cardStreamUrl}
                          qualities={cardStreamsMap[cardKey] || []}
                          onSelectQuality={(fmt) => setCardStreamUrl(fmt.url)}
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() => handleStartInCardStream(cardKey, item.link, 'youtube')}
                        className="relative w-full h-full cursor-pointer"
                      >
                        <SmartImage
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          containerClassName="w-full h-full"
                          fallbackLabel={item.title}
                        />

                        {/* Hover Overlay or Loading Spinner */}
                        <div className={`absolute inset-0 bg-black/40 transition-opacity flex flex-col items-center justify-center p-3 text-center ${
                          isLoadingStream ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          {isLoadingStream ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs font-bold text-white bg-black/70 px-2 py-0.5 rounded">
                                Resolving Stream...
                              </span>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center shadow-lg">
                              <Play className="w-6 h-6 fill-current ml-0.5" />
                            </div>
                          )}
                        </div>

                        {item.duration && !isLoadingStream && (
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[11px] text-white tabular-nums z-10">
                            {item.duration}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Error Banner */}
                  {cardErr && (
                    <div className="p-2 bg-rose-950/80 border-t border-rose-800/80 text-[11px] text-rose-300 flex items-center justify-between gap-1">
                      <span className="truncate">{cardErr}</span>
                      <button
                        onClick={() => onSelectMedia(item.link)}
                        className="text-white underline font-semibold shrink-0"
                      >
                        Try Downloader
                      </button>
                    </div>
                  )}

                  {/* Details & Actions */}
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      {item.channel && (
                        <p className="text-xs text-neutral-400 flex items-center gap-1">
                          <User className="w-3 h-3 text-neutral-500" />
                          <span className="truncate">{item.channel}</span>
                        </p>
                      )}
                    </div>

                    <div className="pt-2 flex items-center gap-2 border-t border-neutral-800/60">
                      {/* Direct Stream Toggle */}
                      <button
                        onClick={() => handleStartInCardStream(cardKey, item.link, 'youtube')}
                        disabled={isLoadingStream}
                        className={`flex-1 py-1.5 px-2 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm ${
                          isPlaying
                            ? 'bg-neutral-800 text-rose-400 hover:bg-neutral-700'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950'
                        }`}
                        title="Stream video directly in this card"
                      >
                        {isPlaying ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Stop Stream</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Stream Now</span>
                          </>
                        )}
                      </button>

                      {/* Download Options Button */}
                      <button
                        onClick={() => onSelectMedia(item.link)}
                        className="flex-1 py-1.5 px-2 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 hover:text-white font-semibold text-xs rounded-lg border border-neutral-700 transition-colors flex items-center justify-center gap-1"
                        title="Forward to Stream & Download section for multi-format choices"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinterest Results Grid */}
      {searchType === 'pinterest' && pinterestResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Pinterest Pins ({pinterestResults.length} matches)
            </h2>
          </div>

          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
            {pinterestResults.map((imgUrl, idx) => {
              const cardKey = `pin_${idx}`;
              const isPlaying = playingCardKey === cardKey && cardStreamUrl;
              const isLoadingStream = loadingCardKey === cardKey;

              return (
                <div
                  key={cardKey}
                  className="break-inside-avoid relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 group"
                >
                  {isPlaying ? (
                    <div className="relative aspect-video bg-black">
                      <button
                        onClick={() => {
                          setPlayingCardKey(null);
                          setCardStreamUrl(null);
                        }}
                        className="absolute top-2 right-2 p-1 bg-black/80 hover:bg-neutral-800 text-white rounded-full transition-colors z-30 shadow-lg border border-neutral-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <StreamPlayer
                        title={`Pinterest Pin #${idx + 1}`}
                        poster={imgUrl}
                        streamUrl={cardStreamUrl}
                      />
                    </div>
                  ) : (
                    <SmartImage
                      src={imgUrl}
                      alt={`Pin result ${idx + 1}`}
                      className="w-full h-auto object-cover transition-transform group-hover:scale-102"
                      containerClassName="w-full"
                      fallbackLabel={`Pin ${idx + 1}`}
                    />
                  )}

                  <div className="p-2.5 bg-neutral-950/90 border-t border-neutral-800/80 flex items-center justify-between gap-1.5">
                    <button
                      onClick={() => handleStartInCardStream(cardKey, imgUrl, 'pinterest')}
                      disabled={isLoadingStream}
                      className="flex-1 py-1 px-2 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-semibold text-[11px] rounded transition-colors flex items-center justify-center gap-1 border border-neutral-700"
                      title="Stream or extract pin media directly"
                    >
                      {isLoadingStream ? (
                        <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>{isPlaying ? 'Stop' : 'Stream'}</span>
                    </button>

                    <button
                      onClick={() => onSelectMedia(imgUrl)}
                      className="py-1 px-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-[11px] rounded flex items-center gap-1 shadow-sm"
                      title="Forward to Download tab"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* NSFW (XNXX & Xvideos) Results Grid */}
      {(searchType === 'xnxx' || searchType === 'xvideos') && nsfwResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white capitalize">
              {searchType.toUpperCase()} Video Results ({nsfwResults.length} matches)
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 uppercase">
              18+ Content
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nsfwResults.map((item, idx) => {
              const videoUrl = item.link || item.url || '';
              const rawThumb = item.thumbnail || item.thumb || '';
              const hasValidThumb = rawThumb && !rawThumb.includes('blank.gif') && rawThumb.length > 10;
              const displayThumb = hasValidThumb ? rawThumb : '';

              const cardKey = `nsfw_${videoUrl || idx}`;
              const isPlaying = playingCardKey === cardKey && cardStreamUrl;
              const isLoadingStream = loadingCardKey === cardKey;
              const cardErr = cardStreamError[cardKey];

              return (
                <div
                  key={cardKey}
                  className="bg-neutral-900/40 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-all flex flex-col justify-between group"
                >
                  {/* Thumbnail OR Direct StreamPlayer */}
                  <div className="relative aspect-video bg-neutral-950 overflow-hidden">
                    {isPlaying ? (
                      <div className="relative w-full h-full bg-black">
                        <button
                          onClick={() => {
                            setPlayingCardKey(null);
                            setCardStreamUrl(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/80 hover:bg-neutral-800 text-white rounded-full transition-colors z-30 shadow-lg border border-neutral-700"
                          title="Close Stream"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <StreamPlayer
                          title={item.title}
                          poster={displayThumb}
                          streamUrl={cardStreamUrl}
                          qualities={cardStreamsMap[cardKey] || []}
                          onSelectQuality={(fmt) => setCardStreamUrl(fmt.url)}
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() => handleStartInCardStream(cardKey, videoUrl, searchType)}
                        className="relative w-full h-full cursor-pointer"
                      >
                        {displayThumb ? (
                          <SmartImage
                            src={displayThumb}
                            alt={item.title}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            containerClassName="w-full h-full"
                            fallbackLabel={item.title}
                          />
                        ) : null}

                        <div
                          className={`w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-rose-950/40 text-rose-400 ${
                            displayThumb ? 'hidden group-has-[img[style*="display: none"]]:flex' : 'flex'
                          }`}
                        >
                          <Flame className="w-7 h-7 text-rose-500/70 mb-1" />
                          <span className="text-[11px] font-semibold text-neutral-300 line-clamp-2 px-2">
                            {item.title}
                          </span>
                        </div>

                        {/* Hover Overlay / Spinner */}
                        <div className={`absolute inset-0 bg-black/40 transition-opacity flex flex-col items-center justify-center ${
                          isLoadingStream ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          {isLoadingStream ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs font-bold text-white bg-black/70 px-2 py-0.5 rounded">
                                Resolving Stream...
                              </span>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-rose-500 text-neutral-950 flex items-center justify-center shadow-lg">
                              <Play className="w-6 h-6 fill-current ml-0.5" />
                            </div>
                          )}
                        </div>

                        {item.duration && !isLoadingStream && (
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[11px] text-white tabular-nums z-10">
                            {item.duration.includes(':') ? item.duration : `${item.duration}m`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Error Banner */}
                  {cardErr && (
                    <div className="p-2 bg-rose-950/80 border-t border-rose-800/80 text-[11px] text-rose-300 flex items-center justify-between gap-1">
                      <span className="truncate">{cardErr}</span>
                      <button
                        onClick={() => onSelectMedia(videoUrl)}
                        className="text-white underline font-semibold shrink-0"
                      >
                        Try Downloader
                      </button>
                    </div>
                  )}

                  {/* Card Details & Action Buttons */}
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      {item.uploader && (
                        <p className="text-xs text-neutral-400">
                          {item.uploader}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-neutral-800/60 flex items-center gap-1.5">
                      {/* Stream Inline Button */}
                      <button
                        onClick={() => handleStartInCardStream(cardKey, videoUrl, searchType)}
                        disabled={isLoadingStream}
                        className={`flex-1 py-1.5 px-2 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm ${
                          isPlaying
                            ? 'bg-neutral-800 text-rose-400 hover:bg-neutral-700'
                            : 'bg-rose-500 hover:bg-rose-400 text-neutral-950'
                        }`}
                        title="Stream video directly in this card"
                      >
                        {isPlaying ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Stop Stream</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Stream Now</span>
                          </>
                        )}
                      </button>

                      {/* Download Button */}
                      <button
                        onClick={() => onSelectMedia(videoUrl)}
                        className="flex-1 py-1.5 px-2 bg-neutral-800 hover:bg-neutral-700 text-rose-300 hover:text-white font-semibold text-xs rounded-lg border border-neutral-700 transition-colors flex items-center justify-center gap-1"
                        title="Forward to Stream & Download tab for multi-resolution downloads"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasSearched && !isLoading && youtubeResults.length === 0 && pinterestResults.length === 0 && nsfwResults.length === 0 && !error && (
        <div className="p-8 text-center text-neutral-400 text-sm border border-neutral-800 rounded-xl bg-neutral-900/30">
          No matches found for &ldquo;{query}&rdquo;. Try another search keyword.
        </div>
      )}
    </div>
  );
};
