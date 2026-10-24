import React, { useEffect, useState } from 'react';
import {
  PlaySquare,
  Download,
  HardDrive,
  Compass,
  Shield,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { usePublicConfig } from '../context/ConfigContext';

export type AppTab = 'downloader' | 'terabox' | 'search' | 'admin';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isAdminLoggedIn: boolean;
}

const NAV_ITEMS: Array<{ tab: AppTab; label: string; shortLabel: string; icon: React.ElementType }> = [
  { tab: 'downloader', label: 'Stream & Download', shortLabel: 'Home', icon: Download },
  { tab: 'terabox', label: 'Terabox Vault', shortLabel: 'Terabox', icon: HardDrive },
  { tab: 'search', label: 'Explore Search', shortLabel: 'Explore', icon: Compass },
  { tab: 'admin', label: 'Admin Console', shortLabel: 'Admin', icon: Shield },
];

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, isAdminLoggedIn }) => {
  const { config } = usePublicConfig();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
        if (!cancelled) setOnline(response.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void check();
    const interval = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => item.tab !== 'search' || config.searchEnabled);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setActiveTab('downloader')}
            className="group flex items-center gap-2.5 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            aria-label="StreamPulse home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-neutral-950 shadow-lg shadow-emerald-500/20 transition-transform group-hover:scale-105">
              <PlaySquare className="h-5 w-5 fill-neutral-950" />
            </div>
            <div className="leading-tight">
              <span className="block text-[17px] font-extrabold tracking-tight text-white">
                Stream<span className="text-emerald-400">Pulse</span>
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Universal media engine
              </span>
            </div>
          </button>

          <nav className="hidden items-center gap-1 rounded-xl border border-neutral-800/70 bg-neutral-900/50 p-1 md:flex" aria-label="Main navigation">
            {visibleItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.tab;
              const isAdmin = item.tab === 'admin';
              return (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? isAdmin
                        ? 'bg-amber-400/15 text-amber-300 shadow-sm'
                        : 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  {isAdmin && isAdminLoggedIn && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {config.maintenanceMode ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 sm:flex">
                <Wrench className="h-3 w-3" /> Maintenance
              </span>
            ) : (
              <span
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:flex ${
                  online === false
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
                title={online === false ? 'API unreachable' : 'API online'}
              >
                {online === false ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                {online === false ? 'Offline' : 'Online'}
              </span>
            )}
            <span className="hidden rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-[10px] text-neutral-500 lg:inline">
              v{config.version}
            </span>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition md:hidden ${
                activeTab === 'admin'
                  ? 'border-amber-500/40 bg-amber-400/15 text-amber-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
              aria-label="Open admin console"
            >
              <Shield className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-4">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => setActiveTab(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                  isActive ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                {item.shortLabel}
                {item.tab === 'admin' && isAdminLoggedIn && (
                  <span className="absolute right-[28%] top-2 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
                {isActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-400" />}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
