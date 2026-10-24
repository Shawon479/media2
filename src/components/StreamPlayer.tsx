import React, { useRef, useState, useEffect } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  FastForward,
  Download,
  Radio,
  Sliders,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { MediaFormat } from '../types';

interface StreamPlayerProps {
  title: string;
  poster?: string;
  streamUrl: string;
  isAudioOnly?: boolean;
  qualities?: MediaFormat[];
  onSelectQuality?: (format: MediaFormat) => void;
  activeQualityId?: string;
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  title,
  poster,
  streamUrl,
  isAudioOnly = false,
  qualities = [],
  onSelectQuality,
  activeQualityId,
}) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate active playable URL (direct or proxied)
  const effectiveUrl = useProxy
    ? `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}`
    : streamUrl;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setHasError(false);
    setErrorMessage('');

    if (isAudioOnly) return;

    const videoEl = mediaRef.current as HTMLVideoElement | null;
    if (!videoEl || !effectiveUrl) return;

    // Clean up previous Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = effectiveUrl.includes('.m3u8') || effectiveUrl.includes('M3U8') || effectiveUrl.includes('m3u8?');

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(effectiveUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!useProxy) {
                setUseProxy(true);
              } else {
                setHasError(true);
                setErrorMessage('Stream network error. Click below to retry or open directly.');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setHasError(true);
              setErrorMessage('Failed to decode media stream. Try direct open.');
              break;
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') && isHlsStream) {
      videoEl.src = effectiveUrl;
      videoEl.load();
    } else {
      videoEl.src = effectiveUrl;
      videoEl.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [effectiveUrl, isAudioOnly, useProxy]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play().catch(err => {
        console.warn('Playback interrupted:', err);
        // If direct fails with CORS, recommend proxy
        if (!useProxy) {
          setUseProxy(true);
        }
      });
    }
  };

  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
  };

  // Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (mediaRef.current) {
      mediaRef.current.volume = val;
      mediaRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!mediaRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    mediaRef.current.muted = newMuted;
  };

  // Playback Rate
  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    if (!mediaRef.current || isAudioOnly) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (mediaRef.current instanceof HTMLVideoElement) {
        await mediaRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP not supported or blocked:', err);
    }
  };

  // Time format
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl flex flex-col group select-none"
    >
      {/* Top Media Bar */}
      <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent z-20 flex items-center justify-between pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2 truncate pr-4">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
            {isAudioOnly ? 'AUDIO STREAM' : 'LIVE PLAYER'}
          </span>
          <span className="text-xs font-medium text-white truncate drop-shadow">{title}</span>
        </div>

        {/* Stream Source Toggle (Proxy vs Direct) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setUseProxy(!useProxy)}
            title={useProxy ? 'Using Proxy Stream (CORS Safe)' : 'Using Direct Stream CDN'}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors flex items-center gap-1 ${
              useProxy
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>{useProxy ? 'Proxy Stream' : 'Direct CDN'}</span>
          </button>
        </div>
      </div>

      {/* Media Canvas Viewport */}
      <div className="relative aspect-video w-full flex items-center justify-center bg-neutral-950 overflow-hidden">
        {isAudioOnly ? (
          // Audio Mode with Waveform visualization
          <div className="flex flex-col items-center justify-center gap-4 p-8 w-full h-full bg-gradient-to-b from-neutral-900 to-neutral-950">
            {poster ? (
              <img
                src={poster}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl object-cover shadow-lg border border-neutral-700/60"
              />
            ) : (
              <div className="w-28 h-28 rounded-xl bg-neutral-800 flex items-center justify-center text-emerald-400 border border-neutral-700">
                <Radio className="w-10 h-10 animate-pulse" />
              </div>
            )}

            {/* Audio Waveform Simulator Bars */}
            <div className="flex items-center gap-1 h-10">
              {[40, 75, 55, 90, 60, 85, 45, 100, 70, 80, 50, 95, 65, 80, 40, 70, 50, 90, 60].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlaying ? 'bg-emerald-400' : 'bg-neutral-700'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(15, (h * Math.sin((i + currentTime) * 0.5) ** 2 * 0.9 + 10))}%` : '20%',
                  }}
                />
              ))}
            </div>

            <audio
              ref={el => {
                mediaRef.current = el;
              }}
              src={effectiveUrl}
              onTimeUpdate={() => {
                if (mediaRef.current) setCurrentTime(mediaRef.current.currentTime);
              }}
              onLoadedMetadata={() => {
                if (mediaRef.current) setDuration(mediaRef.current.duration);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onError={() => {
                setIsBuffering(false);
                setHasError(true);
                setErrorMessage('Audio stream cannot be loaded directly. Click below to switch to stream proxy.');
              }}
            />
          </div>
        ) : (
          // Video Mode
          <>
            <video
              ref={el => {
                mediaRef.current = el;
              }}
              src={effectiveUrl.includes('.m3u8') || effectiveUrl.includes('M3U8') ? undefined : effectiveUrl}
              poster={poster}
              playsInline
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onTimeUpdate={() => {
                if (mediaRef.current) setCurrentTime(mediaRef.current.currentTime);
              }}
              onLoadedMetadata={() => {
                if (mediaRef.current) setDuration(mediaRef.current.duration);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
                setHasError(false);
              }}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                // If it's an HLS stream, Hls.js manages errors, don't trigger native error immediately
                if (effectiveUrl.includes('.m3u8') || effectiveUrl.includes('M3U8')) {
                  return;
                }
                setIsBuffering(false);
                setHasError(true);
                setErrorMessage('Video failed to play directly. Switching to proxy stream mode...');
                if (!useProxy) {
                  setUseProxy(true);
                }
              }}
            />

            {/* Play Overlay Button if paused */}
            {!isPlaying && !isBuffering && !hasError && (
              <button
                onClick={togglePlay}
                aria-label="Play video"
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-emerald-500/90 text-neutral-950 flex items-center justify-center hover:scale-110 hover:bg-emerald-400 transition-transform shadow-2xl focus:outline-none"
              >
                <Play className="w-8 h-8 fill-neutral-950 ml-1" />
              </button>
            )}
          </>
        )}

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center z-10">
            <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        )}

        {/* Error Fallback Overlay */}
        {hasError && (
          <div className="absolute inset-0 bg-neutral-950/90 p-6 flex flex-col items-center justify-center text-center gap-3 z-30">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Sliders className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white max-w-sm">{errorMessage}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setUseProxy(true);
                  setHasError(false);
                  if (mediaRef.current) mediaRef.current.load();
                }}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 text-neutral-950 rounded-lg hover:bg-emerald-400 transition-colors"
              >
                Play with CORS Proxy
              </button>
              <a
                href={streamUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-xs font-medium border border-neutral-700 bg-neutral-900 text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
              >
                <span>Direct Open</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="p-3 bg-neutral-900/90 border-t border-neutral-800/80 flex flex-col gap-2">
        {/* Scrubber Progress Bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-400 tabular-nums w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek media timeline"
              className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
          <span className="text-xs font-mono text-neutral-400 tabular-nums w-10">
            {formatTime(duration)}
          </span>
        </div>

        {/* Button Controls Row */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Left: Play/Pause, Replay, Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-emerald-400" /> : <Play className="w-4 h-4 fill-emerald-400" />}
            </button>

            <button
              onClick={() => {
                if (mediaRef.current) mediaRef.current.currentTime = 0;
              }}
              title="Restart from beginning"
              className="p-1.5 text-neutral-400 hover:text-white rounded transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="p-1.5 text-neutral-400 hover:text-white rounded transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume slider"
                className="w-16 h-1 bg-neutral-700 rounded appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          {/* Right: Quality, Speed, PiP, Download, Fullscreen */}
          <div className="flex items-center gap-1.5">
            {/* Resolution Selector Dropdown (if multiple video qualities exist) */}
            {qualities.length > 0 && onSelectQuality && (
              <select
                value={activeQualityId || qualities[0]?.id}
                onChange={e => {
                  const found = qualities.find(q => q.id === e.target.value);
                  if (found) onSelectQuality(found);
                }}
                className="bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-md px-2 py-1 text-xs font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
                title="Change stream resolution"
              >
                {qualities.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.quality || q.label} {q.fileSizeFormatted ? `(${q.fileSizeFormatted})` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Playback Speed */}
            <div className="relative group/speed">
              <button
                className="px-2 py-1 text-xs font-mono font-medium rounded bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors"
                title="Playback speed"
              >
                {playbackRate}x
              </button>
              <div className="absolute bottom-full right-0 mb-1 hidden group-hover/speed:flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg p-1 shadow-xl z-30 min-w-20">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`px-2 py-1 text-xs text-left rounded hover:bg-neutral-800 ${
                      playbackRate === rate ? 'text-emerald-400 font-semibold' : 'text-neutral-300'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Download Shortcut */}
            <a
              href={`/api/proxy-download?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(title + (isAudioOnly ? '.mp3' : '.mp4'))}`}
              download
              title="Download playing media"
              className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded transition-colors"
            >
              <Download className="w-4 h-4" />
            </a>

            {/* PiP (Video Only) */}
            {!isAudioOnly && (
              <button
                onClick={togglePiP}
                title="Picture-in-Picture"
                className="p-1.5 text-neutral-400 hover:text-white rounded transition-colors"
              >
                <FastForward className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen (Video Only) */}
            {!isAudioOnly && (
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                className="p-1.5 text-neutral-400 hover:text-white rounded transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
