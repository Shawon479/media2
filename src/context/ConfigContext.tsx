import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PublicConfig } from '../types';

const DEFAULT_CONFIG: PublicConfig = {
  appName: 'StreamPulse',
  version: '1.1.0',
  maintenanceMode: false,
  announcementActive: false,
  announcement: '',
  announcementLevel: 'info',
  nsfwEnabled: true,
  searchEnabled: true,
  downloadsEnabled: true,
  rateLimitEnabled: false,
  rateLimitRpm: 60,
};

interface ConfigContextValue {
  config: PublicConfig;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_CONFIG,
  loaded: false,
  refresh: async () => {},
});

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/public-config', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.config) {
        setConfig({ ...DEFAULT_CONFIG, ...payload.config });
      }
    } catch {
      // The app remains usable with defaults if the API is unavailable.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ config, loaded, refresh }), [config, loaded, refresh]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};

export function usePublicConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
