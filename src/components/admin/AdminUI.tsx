import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Inbox,
  Loader2,
  X,
} from 'lucide-react';
import type { AnalyticsPoint } from '../../types';
import { copyToClipboard, formatNumber, formatShortTime } from '../../utils/format';

export const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-neutral-800 bg-neutral-900/40 ${className}`}>{children}</div>
);

export const SectionHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-sm font-bold text-white">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
    </div>
    {action}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone?: 'emerald' | 'sky' | 'amber' | 'red' | 'violet' | 'neutral';
}> = ({ label, value, hint, icon: Icon, tone = 'emerald' }) => {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    neutral: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20',
  };

  return (
    <Card className="p-4 transition hover:border-neutral-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-white">{value}</div>
          {hint && <div className="mt-1 text-[11px] text-neutral-500">{hint}</div>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
};

export const Badge: React.FC<React.PropsWithChildren<{ tone?: string; className?: string }>> = ({
  children,
  tone = 'bg-neutral-800 text-neutral-300 border-neutral-700',
  className = '',
}) => (
  <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone} ${className}`}>
    {children}
  </span>
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  danger?: boolean;
}> = ({ checked, onChange, label, description, disabled, danger }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="text-xs font-semibold text-neutral-200">{label}</p>
      {description && <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${
        checked
          ? danger
            ? 'border-red-500/50 bg-red-500'
            : 'border-emerald-500/50 bg-emerald-500'
          : 'border-neutral-700 bg-neutral-800'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  </div>
);

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

export const LoadingBlock: React.FC<{ label?: string; className?: string }> = ({ label = 'Loading…', className = '' }) => (
  <div className={`flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-10 text-xs text-neutral-400 ${className}`}>
    <Spinner className="h-4 w-4 text-emerald-400" /> {label}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
}> = ({ title, description, icon: Icon = Inbox, action }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-900/20 px-6 py-12 text-center">
    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-500">
      <Icon className="h-5 w-5" />
    </div>
    <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-xs text-neutral-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const CopyButton: React.FC<{ value: string; label?: string; className?: string }> = ({
  value,
  label,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }
      }}
      className={`inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] font-semibold text-neutral-300 transition hover:bg-neutral-700 hover:text-white ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, onClose, title, children, footer, wide }) => {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label="Close dialog" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-neutral-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', busy, danger = true, onCancel, onConfirm }) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    footer={
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
            danger ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
          }`}
        >
          {busy && <Spinner />}
          {confirmLabel}
        </button>
      </div>
    }
  >
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${danger ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-xs leading-relaxed text-neutral-400">{message}</p>
    </div>
  </Modal>
);

export const TrafficChart: React.FC<{ series: AnalyticsPoint[]; height?: number }> = ({ series, height = 190 }) => {
  if (!series || series.length === 0) {
    return <div className="flex h-40 items-center justify-center text-xs text-neutral-500">No traffic data yet.</div>;
  }

  const width = 800;
  const chartHeight = 170;
  const topPadding = 10;
  const maxValue = Math.max(1, ...series.map(point => point.requests));
  const stepX = series.length > 1 ? width / (series.length - 1) : width;
  const toY = (value: number) => topPadding + chartHeight - (value / maxValue) * (chartHeight - topPadding);

  const requestPoints = series.map((point, index) => `${index * stepX},${toY(point.requests)}`).join(' ');
  const errorPoints = series.map((point, index) => `${index * stepX},${toY(point.errors)}`).join(' ');
  const areaPath = `M0,${chartHeight + topPadding} L${requestPoints.split(' ').join(' L')} L${width},${chartHeight + topPadding} Z`;

  const totalRequests = series.reduce((sum, point) => sum + point.requests, 0);
  const totalErrors = series.reduce((sum, point) => sum + point.errors, 0);
  const first = series[0];
  const middle = series[Math.floor(series.length / 2)];
  const last = series[series.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> {formatNumber(totalRequests)} requests
          </span>
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-red-400" /> {formatNumber(totalErrors)} errors
          </span>
        </div>
        <span className="text-neutral-600">Peak {formatNumber(maxValue)}/h</span>
      </div>
      <svg viewBox={`0 0 ${width} ${chartHeight + topPadding + 22}`} className="w-full" style={{ height }} role="img" aria-label="Request traffic chart">
        <defs>
          <linearGradient id="trafficArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(ratio => (
          <line
            key={ratio}
            x1="0"
            y1={topPadding + chartHeight - ratio * (chartHeight - topPadding)}
            x2={width}
            y2={topPadding + chartHeight - ratio * (chartHeight - topPadding)}
            stroke="#262626"
            strokeDasharray="3 5"
          />
        ))}
        <path d={areaPath} fill="url(#trafficArea)" />
        <polyline points={requestPoints} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={errorPoints} fill="none" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
        {series.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={index * stepX} cy={toY(point.requests)} r="8" fill="transparent">
              <title>{`${formatShortTime(point.label)} — ${point.requests} requests, ${point.errors} errors`}</title>
            </circle>
          </g>
        ))}
        <text x="0" y={chartHeight + topPadding + 18} fill="#737373" fontSize="10">{formatShortTime(first?.label)}</text>
        <text x={width / 2} y={chartHeight + topPadding + 18} fill="#737373" fontSize="10" textAnchor="middle">{formatShortTime(middle?.label)}</text>
        <text x={width} y={chartHeight + topPadding + 18} fill="#737373" fontSize="10" textAnchor="end">{formatShortTime(last?.label)}</text>
      </svg>
    </div>
  );
};

export const Field: React.FC<React.PropsWithChildren<{ label: string; hint?: string; className?: string }>> = ({
  label,
  hint,
  children,
  className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/10';

export const selectClass =
  'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/10';
