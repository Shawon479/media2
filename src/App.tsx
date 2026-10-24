import React, { useState } from 'react';
import { Header, AppTab } from './components/Header';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { StreamDownloader } from './components/StreamDownloader';
import { TeraboxHub } from './components/TeraboxHub';
import { ExploreSearch } from './components/ExploreSearch';
import { AdminPanel } from './components/AdminPanel';
import { RecentlyResolved } from './components/RecentlyResolved';
import { Footer } from './components/Footer';
import { LegalModal, LegalTab } from './components/LegalModal';
import { usePublicConfig } from './context/ConfigContext';
import { Wrench, Shield, ArrowRight } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('downloader');
  const [injectedUrl, setInjectedUrl] = useState<string>('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState<number>(0);
  const { config } = usePublicConfig();

  // Transition from Search Hub or Recently Resolved into Downloader or Terabox
  const handleSelectMediaFromSearch = (url: string) => {
    setInjectedUrl(url);
    if (url.includes('1024tera.com') || url.includes('terabox.com')) {
      setActiveTab('terabox');
    } else {
      setActiveTab('downloader');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchQuery = (query: string) => {
    setInjectedUrl(query);
    setActiveTab('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExtractionSuccess = () => {
    setHistoryRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-neutral-950">
      {/* Real-time Announcement Banner */}
      <AnnouncementBanner />

      {/* Top Header Navigation (Top Bar Contract) */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminLoggedIn={isAdminLoggedIn}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12">
        {/* Maintenance Mode Alert Banner if active */}
        {config.maintenanceMode && activeTab !== 'admin' && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 text-amber-200 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white">System Under Maintenance</h3>
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  StreamPulse is currently in scheduled maintenance mode. Link extraction, search queries, and proxy streams are temporarily paused while upstream maintenance is applied.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('admin')}
              className="inline-flex items-center gap-1.5 self-start sm:self-center shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Admin Console</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {activeTab === 'downloader' && (
          <div className="space-y-8">
            <StreamDownloader
              key={injectedUrl}
              initialUrl={injectedUrl}
              onNavigateToTerabox={url => {
                setInjectedUrl(url);
                setActiveTab('terabox');
              }}
              onExtractionSuccess={handleExtractionSuccess}
            />

            {/* Privacy-Safe Recently Resolved Carousel */}
            <RecentlyResolved
              onSelectMedia={handleSelectMediaFromSearch}
              onSearchQuery={handleSearchQuery}
              refreshTrigger={historyRefreshTrigger}
            />
          </div>
        )}

        {activeTab === 'terabox' && (
          <TeraboxHub
            key={injectedUrl}
            defaultUrl={injectedUrl || ''}
          />
        )}

        {activeTab === 'search' && (
          <ExploreSearch onSelectMedia={handleSelectMediaFromSearch} />
        )}

        {activeTab === 'admin' && (
          <AdminPanel onLoginStateChange={setIsAdminLoggedIn} />
        )}
      </main>

      {/* Production-Grade Global Footer */}
      <Footer
        onNavigate={setActiveTab}
        onOpenLegal={tab => setLegalModalTab(tab)}
      />

      {/* Legal & Compliance Modal (Privacy, Terms, DMCA, 18+ Notice) */}
      <LegalModal
        open={Boolean(legalModalTab)}
        initialTab={legalModalTab || 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />
    </div>
  );
}
