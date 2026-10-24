export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('en-US', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function formatBytes(value: number | undefined | null): string {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${parseFloat((value / 1024 ** index).toFixed(2))} ${units[index]}`;
}

export function formatDateTime(value: string | number | Date | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatShortTime(value: string | number | Date | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value: string | number | Date | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds < 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

export function platformLabel(platform: string | undefined): string {
  if (!platform) return 'Unknown';
  const labels: Record<string, string> = {
    youtube: 'YouTube',
    terabox: 'Terabox',
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    xnxx: 'XNXX',
    xvideos: 'Xvideos',
    aio: 'Universal',
    auto: 'Auto detect',
    system: 'System',
  };
  return labels[platform.toLowerCase()] || platform;
}

export function platformTone(platform: string | undefined): string {
  switch ((platform || '').toLowerCase()) {
    case 'youtube':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'terabox':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'facebook':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'instagram':
      return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
    case 'tiktok':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'pinterest':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'xnxx':
    case 'xvideos':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'system':
      return 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30';
    default:
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }
}

export function statusTone(status: number): string {
  if (status >= 500) return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (status >= 400) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (status >= 300) return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

export function truncate(value: string, max = 100): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copyCommand = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
      textarea.remove();
      return Boolean(copyCommand);
    } catch {
      return false;
    }
  }
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const escape = (value: unknown) => {
    const text = value === undefined || value === null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n');
}
