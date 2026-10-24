import React, { useState } from 'react';
import { Play, Download, ExternalLink, HardDrive, ShieldCheck } from 'lucide-react';
import { MediaFormat } from '../types';
import { usePublicConfig } from '../context/ConfigContext';

interface QualityTableProps {
  mediaTitle: string;
  formats: MediaFormat[];
  activeStreamUrl?: string;
  onPlayFormat: (fmt: MediaFormat) => void;
}

export const QualityTable: React.FC<QualityTableProps> = ({
  mediaTitle,
  formats,
  activeStreamUrl,
  onPlayFormat,
}) => {
  const { config } = usePublicConfig();
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  if (!formats || formats.length === 0) {
    return (
      <div className="p-6 text-center text-neutral-400 text-sm border border-dashed border-neutral-800 rounded-xl bg-neutral-900/30">
        No additional quality formats reported by source gateway.
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40">
      <div className="px-4 py-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Available Streams & Download Formats</h3>
        </div>
        <span className="text-xs text-neutral-400 font-mono tabular-nums">
          {formats.length} {formats.length === 1 ? 'option' : 'options'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-neutral-950/60 text-neutral-400 uppercase tracking-wider text-[11px] font-medium border-b border-neutral-800">
            <tr>
              <th className="py-2.5 px-4">Quality & Format</th>
              <th className="py-2.5 px-3">Resolution</th>
              <th className="py-2.5 px-3">Est. Size</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 font-normal">
            {formats.map((fmt, idx) => {
              const isActive = activeStreamUrl === fmt.url;
              const isAudio = fmt.extension === 'mp3' || fmt.quality?.toLowerCase().includes('audio');
              const cleanFileName = `${mediaTitle.replace(/[/\\?%*:|"<>]/g, '_')}_${fmt.quality || 'media'}.${fmt.extension || 'mp4'}`;

              return (
                <tr
                  key={fmt.id || idx}
                  className={`hover:bg-neutral-800/40 transition-colors ${
                    isActive ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  {/* Quality & Label */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                          isAudio
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/50'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                        }`}
                      >
                        {fmt.extension.toUpperCase()}
                      </span>
                      <span className="font-medium text-white truncate max-w-xs sm:max-w-md">
                        {fmt.label || fmt.quality}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500 text-neutral-950 font-bold">
                          PLAYING
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Resolution */}
                  <td className="py-3 px-3 text-neutral-400 font-mono text-xs">
                    {fmt.resolution || (isAudio ? 'Audio Stream' : (fmt.quality || 'Auto'))}
                    {fmt.fps ? ` · ${fmt.fps}fps` : ''}
                  </td>

                  {/* Size */}
                  <td className="py-3 px-3 text-neutral-300 font-mono text-xs tabular-nums">
                    {fmt.fileSizeFormatted || 'Variable'}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Stream button */}
                      {fmt.directStreamable && (
                        <button
                          onClick={() => onPlayFormat(fmt)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 transition-colors ${
                            isActive
                              ? 'bg-emerald-500 text-neutral-950'
                              : 'bg-neutral-800 text-emerald-400 hover:bg-neutral-700'
                          }`}
                          title="Stream in media player"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span className="hidden sm:inline">Stream</span>
                        </button>
                      )}

                      {/* Copy Download Link */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fmt.url);
                          setCopiedUrlId(fmt.id);
                          setTimeout(() => setCopiedUrlId(null), 2000);
                        }}
                        className="px-2 py-1 text-xs font-medium rounded-md bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700 transition-colors flex items-center gap-1"
                        title="Copy direct download link to clipboard"
                      >
                        {copiedUrlId === fmt.id ? (
                          <span className="text-emerald-400 text-[11px] font-semibold">Copied!</span>
                        ) : (
                          <span>Copy</span>
                        )}
                      </button>

                      {/* Direct Download Link */}
                      <a
                        href={fmt.url}
                        target="_blank"
                        rel="noreferrer"
                        download={cleanFileName}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 border border-neutral-700 transition-colors flex items-center gap-1"
                        title="Open direct media link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Direct</span>
                      </a>

                      {/* Proxied Safe Download */}
                      {config.downloadsEnabled ? (
                        <a
                          href={`/api/proxy-download?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(cleanFileName)}`}
                          download={cleanFileName}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-neutral-950 transition-colors flex items-center gap-1"
                          title="Save media file to your device"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      ) : (
                        <span
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-neutral-800 text-neutral-500 cursor-not-allowed flex items-center gap-1"
                          title="Downloads are currently disabled on this instance"
                        >
                          <Download className="w-3 h-3 opacity-40" />
                          <span>Stream Only</span>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
