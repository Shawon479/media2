import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Braces,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Film,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings2,
  Shield,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import type { AdminRuntimeInfo, AdminTab, SystemConfig } from '../types';
import { adminFetch, SessionExpiredError } from './admin/adminApi';
import { AdminLogin } from './admin/AdminLogin';
import { AdminOverview } from './admin/AdminOverview';
import { AdminAnalytics } from './admin/AdminAnalytics';
import { AdminLogs } from './admin/AdminLogs';
import { AdminMedia } from './admin/AdminMedia';
import { AdminHealth } from './admin/AdminHealth';
import { AdminSandbox } from './admin/AdminSandbox';
import { AdminApiDocs } from './admin/AdminApiDocs';
import { AdminSecurity } from './admin/AdminSecurity';
import { AdminSettings } from './admin/AdminSettings';
import { Badge, Spinner } from './admin/AdminUI';
import { formatDateTime } from '../utils/format';

interface AdminPanelProps {
  onLoginStateChange?: (isLoggedIn: boolean) => void;
}

const TOKEN_KEY = 'sp_admin_token';

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: AdminTab; label: string; icon: React.ElementType; hint?: string }>;
}> = [
  {
    label: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'logs', label: 'Audit logs', icon: FileText },
      { id: 'media', label: 'Media history', icon: Film },
    ],
  },
  {
    label: 'Developer',
    items: [
      { id: 'health', label: 'Health checks', icon: Activity },
      { id: 'sandbox', label: 'API sandbox', icon: Terminal },
      { id: 'api', label: 'API reference', icon: Braces },
    ],
  },
  {
    label: 'Control',
    items: [
      { id: 'security', label: 'Security', icon: ShieldCheck },
      { id: 'settings', label: 'Settings', icon: Settings2 },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap(group => group.items);

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onLoginStateChange }) => {
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [authState, setAuthState] = useState<'checking' | 'login' | 'authed'>('checking');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [runtime, setRuntime] = useState<AdminRuntimeInfo | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [booting, setBooting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());

  const notifyLoginState = useCallback(
    (loggedIn: boolean) => {
      try {
        onLoginStateChange?.(loggedIn);
      } catch {
        // The parent callback should never break the console.
      }
    },
    [onLoginStateChange]
  );

  const pushToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(previous => [...previous.slice(-3), { id, message, type }]);
    window.setTimeout(() => {
      setToasts(previous => previous.filter(toast => toast.id !== id));
    }, 5200);
  }, []);

  const clearSession = useCallback(
    (message = 'Your admin session has expired. Please sign in again.') => {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // ignore
      }
      setToken('');
      setConfig(null);
      setRuntime(null);
      setExpiresAt('');
      setAuthState('login');
      notifyLoginState(false);
      if (message) pushToast(message, 'error');
    },
    [notifyLoginState, pushToast]
  );

  const handleError = useCallback(
    (message: string) => {
      pushToast(message, 'error');
    },
    [pushToast]
  );

  const loadBootstrap = useCallback(
    async (activeToken: string) => {
      setBooting(true);
      try {
        const response = await adminFetch<{ success: boolean; config: SystemConfig; runtime: AdminRuntimeInfo }>(
          '/api/admin/config',
          activeToken
        );
        setConfig(response.config);
        setRuntime(response.runtime);
      } catch (error: any) {
        if (error?.name === 'SessionExpiredError') {
          clearSession(error.message || 'Your admin session expired.');
          return;
        }
        handleError(error.message || 'Could not load admin configuration.');
      } finally {
        setBooting(false);
      }
    },
    [clearSession, handleError]
  );

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      const stored = (() => {
        try {
          return sessionStorage.getItem(TOKEN_KEY) || '';
        } catch {
          return '';
        }
      })();

      if (!stored) {
        if (!cancelled) {
          setAuthState('login');
          notifyLoginState(false);
        }
        return;
      }

      try {
        const session = await adminFetch<{ success: boolean; session: { id: string; expiresAt: string } }>(
          '/api/admin/session',
          stored
        );
        if (cancelled) return;
        setToken(stored);
        setExpiresAt(session.session.expiresAt);
        setAuthState('authed');
        notifyLoginState(true);
        await loadBootstrap(stored);
      } catch (error: any) {
        if (cancelled) return;
        if (error instanceof SessionExpiredError || error?.name === 'SessionExpiredError') {
          try {
            sessionStorage.removeItem(TOKEN_KEY);
          } catch {
            // ignore
          }
          setAuthState('login');
          notifyLoginState(false);
        } else {
          // Network failure: keep the token, but require a retry from the login screen.
          setAuthState('login');
          notifyLoginState(false);
          pushToast(error.message || 'Could not reach the admin API.', 'error');
        }
      }
    };

    void validate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleLoginSuccess = async (newToken: string, expiry: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, newToken);
    } catch {
      // sessionStorage can be blocked in private modes; the token still works for this view.
    }
    setToken(newToken);
    setExpiresAt(expiry);
    setAuthState('authed');
    notifyLoginState(true);
    setActiveTab('overview');
    pushToast('Signed in to the admin console.', 'success');
    await loadBootstrap(newToken);
  };

  const logout = async () => {
    try {
      if (token) await adminFetch('/api/admin/logout', token, { method: 'POST' });
    } catch {
      // Revocation is best-effort; the local token is removed regardless.
    }
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken('');
    setConfig(null);
    setRuntime(null);
    setExpiresAt('');
    setAuthState('login');
    notifyLoginState(false);
    pushToast('Signed out.', 'info');
  };

  const handleConfigUpdated = (newConfig: SystemConfig, newRuntime: AdminRuntimeInfo) => {
    setConfig(newConfig);
    setRuntime(newRuntime);
  };

  const remaining = useMemo(() => {
    if (!expiresAt) return '';
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return 'Expired';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${Math.max(1, minutes)}m left`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m left`;
  }, [expiresAt, now]);

  if (authState === 'checking') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-10 py-12">
          <Spinner className="h-7 w-7 text-emerald-400" />
          <p className="text-xs font-semibold text-neutral-400">Verifying admin session…</p>
        </div>
      </div>
    );
  }

  if (authState === 'login' || !token) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md items-center px-4 py-10">
        <div className="w-full">
          <AdminLogin onSuccess={handleLoginSuccess} />
          <p className="mt-4 text-center text-[11px] text-neutral-600">
            Tip: credentials live in the server environment, never in this browser bundle.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (booting && !config) {
      return (
        <div className="flex min-h-[320px] items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-500">
          <Spinner className="h-5 w-5 text-emerald-400" /> Loading admin workspace…
        </div>
      );
    }

    switch (activeTab) {
      case 'overview':
        return (
          <AdminOverview
            token={token}
            runtime={runtime}
            config={config}
            onSessionExpired={() => clearSession()}
            onNavigate={setActiveTab}
            onError={handleError}
          />
        );
      case 'analytics':
        return <AdminAnalytics token={token} onSessionExpired={() => clearSession()} onError={handleError} />;
      case 'logs':
        return <AdminLogs token={token} onSessionExpired={() => clearSession()} onError={handleError} />;
      case 'media':
        return <AdminMedia token={token} onSessionExpired={() => clearSession()} onError={handleError} />;
      case 'health':
        return (
          <AdminHealth
            token={token}
            config={config}
            onSessionExpired={() => clearSession()}
            onError={handleError}
          />
        );
      case 'sandbox':
        return (
          <AdminSandbox
            token={token}
            config={config}
            onSessionExpired={() => clearSession()}
            onError={handleError}
          />
        );
      case 'api':
        return <AdminApiDocs onNavigate={setActiveTab} />;
      case 'security':
        return (
          <AdminSecurity
            token={token}
            runtime={runtime}
            config={config}
            onSessionExpired={() => clearSession()}
            onError={handleError}
            onToast={pushToast}
          />
        );
      case 'settings':
        return (
          <AdminSettings
            token={token}
            config={config}
            runtime={runtime}
            onSessionExpired={() => clearSession()}
            onError={handleError}
            onToast={pushToast}
            onConfigUpdated={handleConfigUpdated}
          />
        );
      default:
        return null;
    }
  };

  const activeMeta = ALL_TABS.find(tab => tab.id === activeTab);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-gradient-to-r from-neutral-900/80 via-neutral-900/40 to-neutral-950 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-400/10 text-amber-300">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-tight text-white">Admin console</h1>
              <Badge tone="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                <ShieldCheck className="h-3 w-3" /> Secure session
              </Badge>
              <Badge
                tone={
                  runtime?.environment === 'production'
                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }
              >
                {runtime?.environment || 'development'}
              </Badge>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
              <span className="inline-flex items-center gap-1"><Database className="h-3 w-3" /> {runtime?.remoteDatabase ? 'Turso' : 'SQLite'}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {remaining || 'Session active'}</span>
              {expiresAt && <span className="hidden sm:inline">· expires {formatDateTime(expiresAt)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              window.location.hash = '#/home';
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-[11px] font-semibold text-neutral-300 transition hover:bg-neutral-700 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View site
          </button>
          <button
            onClick={() => void loadBootstrap(token)}
            disabled={booting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-[11px] font-semibold text-neutral-300 transition hover:bg-neutral-700 hover:text-white disabled:opacity-50"
            title="Reload configuration"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${booting ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-2 text-[11px] font-semibold text-red-300 transition hover:bg-red-950/70"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40 p-1.5 lg:flex-col lg:gap-3 lg:p-2.5">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="contents lg:block">
                <p className="hidden px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600 lg:block">
                  {group.label}
                </p>
                <div className="contents lg:block lg:space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition lg:flex lg:w-full lg:justify-start ${
                          active
                            ? 'bg-neutral-800 text-white shadow-sm'
                            : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : ''}`} />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 hidden rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 lg:block">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${config?.maintenanceMode ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                {config?.maintenanceMode ? 'Maintenance' : 'Gateway live'}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-600">
              {config?.maintenanceMode
                ? 'Public routes are returning 503.'
                : `${config?.rateLimitEnabled ? `${config.rateLimitRpm} rpm limit` : 'No rate limit'} · v${runtime?.version || '—'}`}
            </p>
            <button
              onClick={() => setActiveTab('settings')}
              className="mt-2.5 flex w-full items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[10px] font-semibold text-neutral-500 transition hover:text-emerald-300"
            >
              Manage settings <Settings2 className="h-3 w-3" />
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          {activeMeta && activeTab !== 'overview' && (
            <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              Admin <span className="text-neutral-700">/</span> <span className="text-neutral-400">{activeMeta.label}</span>
            </div>
          )}
          {renderContent()}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-20 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs shadow-2xl backdrop-blur-xl ${
              toast.type === 'success'
                ? 'border-emerald-800/70 bg-emerald-950/90 text-emerald-100'
                : toast.type === 'error'
                  ? 'border-red-800/70 bg-red-950/90 text-red-100'
                  : 'border-neutral-700 bg-neutral-900/95 text-neutral-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            ) : (
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
            )}
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              onClick={() => setToasts(previous => previous.filter(item => item.id !== toast.id))}
              className="rounded p-0.5 opacity-60 transition hover:bg-white/10 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPanel;
