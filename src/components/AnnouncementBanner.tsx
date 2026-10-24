import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Megaphone,
  Wrench,
  X,
} from 'lucide-react';
import { usePublicConfig } from '../context/ConfigContext';

const LEVELS = {
  info: {
    icon: Info,
    classes: 'border-sky-800/70 bg-sky-950/60 text-sky-100',
    iconClasses: 'text-sky-400',
  },
  success: {
    icon: CheckCircle2,
    classes: 'border-emerald-800/70 bg-emerald-950/60 text-emerald-100',
    iconClasses: 'text-emerald-400',
  },
  warning: {
    icon: AlertTriangle,
    classes: 'border-amber-800/70 bg-amber-950/60 text-amber-100',
    iconClasses: 'text-amber-400',
  },
  critical: {
    icon: AlertOctagon,
    classes: 'border-red-800/70 bg-red-950/60 text-red-100',
    iconClasses: 'text-red-400',
  },
};

export const AnnouncementBanner: React.FC = () => {
  const { config } = usePublicConfig();
  const [dismissedKey, setDismissedKey] = useState<string>('');

  useEffect(() => {
    try {
      setDismissedKey(localStorage.getItem('sp_announcement_dismissed') || '');
    } catch {
      // ignore storage failures
    }
  }, []);

  const message = config.maintenanceMode
    ? 'StreamPulse is in maintenance mode. Extraction, search and proxies are paused while updates are applied.'
    : config.announcement;
  const active = config.maintenanceMode || (config.announcementActive && Boolean(config.announcement));
  if (!active || !message) return null;

  const key = `${config.maintenanceMode ? 'maintenance' : config.announcementLevel}:${message}`;
  if (dismissedKey === key) return null;

  const level = config.maintenanceMode ? 'warning' : config.announcementLevel;
  const style = LEVELS[level] || LEVELS.info;
  const Icon = config.maintenanceMode ? Wrench : style.icon;

  const dismiss = () => {
    setDismissedKey(key);
    try {
      localStorage.setItem('sp_announcement_dismissed', key);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`border-b ${style.classes}`}>
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-2.5 sm:items-center sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${style.iconClasses}`} />
          <p className="text-xs font-medium leading-relaxed sm:text-sm">{message}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const AnnouncementPreview: React.FC<{ level: string; message: string }> = ({ level, message }) => {
  if (!message) return null;
  const style = LEVELS[(level as keyof typeof LEVELS) || 'info'] || LEVELS.info;
  const Icon = style.icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${style.classes}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClasses}`} />
      <span>{message}</span>
      <Megaphone className="ml-auto h-4 w-4 shrink-0 opacity-40" />
    </div>
  );
};
