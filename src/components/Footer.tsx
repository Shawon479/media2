import React from 'react';
import { Github, Heart, PlaySquare, ShieldCheck, Zap } from 'lucide-react';
import { usePublicConfig } from '../context/ConfigContext';
import type { AppTab } from './Header';
import type { LegalTab } from './LegalModal';

interface FooterProps {
  onNavigate: (tab: AppTab) => void;
  onOpenLegal: (tab: LegalTab) => void;
}

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'Pinterest', 'Terabox'];

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenLegal }) => {
  const { config } = usePublicConfig();

  return (
    <footer className="mt-16 border-t border-neutral-800/80 bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <button onClick={() => onNavigate('downloader')} className="flex items-center gap-2.5 text-left">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 text-neutral-950">
                <PlaySquare className="h-5 w-5 fill-neutral-950" />
              </div>
              <span className="text-lg font-extrabold tracking-tight text-white">
                Stream<span className="text-emerald-400">Pulse</span>
              </span>
            </button>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
              A fast, privacy-first media workspace. Resolve links from your favourite platforms, stream directly,
              and grab the quality you need — with a serious admin console behind it.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PLATFORMS.map(platform => (
                <span key={platform} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] font-medium text-neutral-400">
                  {platform}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-emerald-400" /> Direct + proxied streaming</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> SSRF-protected gateway</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Product</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><button onClick={() => onNavigate('downloader')} className="text-neutral-400 transition hover:text-emerald-300">Stream & download</button></li>
              <li><button onClick={() => onNavigate('terabox')} className="text-neutral-400 transition hover:text-emerald-300">Terabox vault</button></li>
              {config.searchEnabled && (
                <li><button onClick={() => onNavigate('search')} className="text-neutral-400 transition hover:text-emerald-300">Explore search</button></li>
              )}
              <li><button onClick={() => onNavigate('admin')} className="text-neutral-400 transition hover:text-emerald-300">Admin console</button></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Resources</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="/api/health" target="_blank" rel="noreferrer" className="text-neutral-400 transition hover:text-emerald-300">
                  API health
                </a>
              </li>
              <li>
                <a href="/api/public-config" target="_blank" rel="noreferrer" className="text-neutral-400 transition hover:text-emerald-300">
                  Public config
                </a>
              </li>
              <li><button onClick={() => onOpenLegal('privacy')} className="text-neutral-400 transition hover:text-emerald-300">Privacy</button></li>
              <li><button onClick={() => onOpenLegal('terms')} className="text-neutral-400 transition hover:text-emerald-300">Terms</button></li>
              <li><button onClick={() => onOpenLegal('dmca')} className="text-neutral-400 transition hover:text-emerald-300">Copyright / DMCA</button></li>
              <li><button onClick={() => onOpenLegal('adult')} className="text-neutral-400 transition hover:text-emerald-300">18+ notice</button></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-neutral-800/80 pt-6 text-[11px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} StreamPulse. For personal and authorized use only.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-neutral-600">v{config.version}</span>
            <span className="inline-flex items-center gap-1">
              Built with <Heart className="h-3 w-3 fill-emerald-400 text-emerald-400" /> for the open web
            </span>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-neutral-500 transition hover:text-neutral-300"
              aria-label="GitHub"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
