import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Braces,
  Copy,
  ExternalLink,
  Lock,
  Search,
  Server,
} from 'lucide-react';
import { Badge, Card, CopyButton, Field, SectionHeader, inputClass } from './AdminUI';
import type { AdminTab } from '../../types';

interface EndpointDoc {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  title: string;
  description: string;
  auth?: boolean;
  example: string;
  group: 'Media' | 'Search & discovery' | 'Proxies' | 'System' | 'Admin';
}

const METHOD_TONES: Record<string, string> = {
  GET: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  POST: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  DELETE: 'bg-red-500/10 text-red-300 border-red-500/20',
};

export const AdminApiDocs: React.FC<{ onNavigate: (tab: AdminTab) => void }> = ({ onNavigate }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');

  const docs: EndpointDoc[] = useMemo(
    () => [
      {
        group: 'Media',
        method: 'POST',
        path: '/api/extract',
        title: 'Extract media formats',
        description: 'Resolve a YouTube, TikTok, Instagram, Facebook, Pinterest, Terabox or adult URL into normalized stream and download formats.',
        example: `curl -X POST '${origin}/api/extract' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","platform":"auto","preferAudio":false}'`,
      },
      {
        group: 'Media',
        method: 'GET',
        path: '/api/youtube-transcript?url=',
        title: 'YouTube transcript',
        description: 'Return time-coded transcript lines for a YouTube video, when captions are available.',
        example: `curl '${origin}/api/youtube-transcript?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}'`,
      },
      {
        group: 'Media',
        method: 'GET',
        path: '/api/media-history?limit=8',
        title: 'Recent public media',
        description: 'Safe recent titles, thumbnails, platform and duration. No source URLs or client IPs are exposed. Adult items are excluded when NSFW is off.',
        example: `curl '${origin}/api/media-history?limit=8'`,
      },
      {
        group: 'Search & discovery',
        method: 'GET',
        path: '/api/search?type=youtube&q=',
        title: 'Search media',
        description: 'Search YouTube, Pinterest, XNXX or Xvideos. Returns normalized cards with title, thumbnail, duration and source link.',
        example: `curl '${origin}/api/search?type=youtube&q=${encodeURIComponent('lofi beats')}'`,
      },
      {
        group: 'Proxies',
        method: 'GET',
        path: '/api/proxy-stream?url=',
        title: 'Stream proxy',
        description: 'Range-aware media relay with SSRF validation on every redirect. Use it when a CDN blocks direct playback with CORS or hotlink rules.',
        example: `curl -I '${origin}/api/proxy-stream?url=${encodeURIComponent('https://example.com/video.mp4')}'`,
      },
      {
        group: 'Proxies',
        method: 'GET',
        path: '/api/proxy-download?url=&filename=',
        title: 'Download proxy',
        description: 'Attachment relay with a sanitized Content-Disposition header. Disabled when downloads are switched off in settings.',
        example: `curl -OJ '${origin}/api/proxy-download?url=${encodeURIComponent('https://example.com/video.mp4')}&filename=sample.mp4'`,
      },
      {
        group: 'Proxies',
        method: 'GET',
        path: '/api/proxy-image?url=',
        title: 'Image proxy',
        description: 'Fetch remote thumbnails with a 12 MB cap and image content-type enforcement. Results are cached for one day.',
        example: `curl '${origin}/api/proxy-image?url=${encodeURIComponent('https://example.com/thumb.jpg')}' -o thumb.jpg`,
      },
      {
        group: 'System',
        method: 'GET',
        path: '/api/health',
        title: 'Health probe',
        description: 'Returns service status, version, uptime and database connectivity. Suitable for Render, Docker and uptime monitors.',
        example: `curl '${origin}/api/health'`,
      },
      {
        group: 'System',
        method: 'GET',
        path: '/api/public-config',
        title: 'Public configuration',
        description: 'Feature flags and branding needed by the client: maintenance, search, downloads, NSFW, rate limit and announcement.',
        example: `curl '${origin}/api/public-config'`,
      },
      {
        group: 'Admin',
        method: 'POST',
        path: '/api/admin/login',
        title: 'Create admin session',
        description: 'Exchange the admin password for a signed bearer token. Failed attempts are rate-limited per IP.',
        auth: true,
        example: `curl -X POST '${origin}/api/admin/login' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"password":"YOUR_ADMIN_PASSWORD"}'`,
      },
      {
        group: 'Admin',
        method: 'GET',
        path: '/api/admin/stats',
        title: 'Dashboard statistics',
        description: 'Counters, platform/action breakdowns, error rate, latency, memory, uptime and database diagnostics.',
        auth: true,
        example: `curl '${origin}/api/admin/stats' -H 'Authorization: Bearer $TOKEN'`,
      },
      {
        group: 'Admin',
        method: 'GET',
        path: '/api/admin/analytics?hours=24',
        title: 'Traffic analytics',
        description: 'Hourly series plus top platforms, actions, inputs, clients and recent errors.',
        auth: true,
        example: `curl '${origin}/api/admin/analytics?hours=24' -H 'Authorization: Bearer $TOKEN'`,
      },
      {
        group: 'Admin',
        method: 'GET',
        path: '/api/admin/logs?limit=100',
        title: 'Audit logs',
        description: 'Paginated, filterable request logs. Supports q, platform, action, status, from, to, limit and offset.',
        auth: true,
        example: `curl '${origin}/api/admin/logs?status=error&limit=20' -H 'Authorization: Bearer $TOKEN'`,
      },
      {
        group: 'Admin',
        method: 'GET',
        path: '/api/admin/media',
        title: 'Media history',
        description: 'Search and paginate stored media resolutions, including formats and source URLs.',
        auth: true,
        example: `curl '${origin}/api/admin/media?limit=24' -H 'Authorization: Bearer $TOKEN'`,
      },
      {
        group: 'Admin',
        method: 'POST',
        path: '/api/admin/config',
        title: 'Update configuration',
        description: 'Change the upstream base URL, announcement, maintenance, rate limiting and feature flags.',
        auth: true,
        example: `curl -X POST '${origin}/api/admin/config' \\\n  -H 'Authorization: Bearer $TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"maintenanceMode":false,"rateLimitEnabled":true,"rateLimitRpm":60}'`,
      },
      {
        group: 'Admin',
        method: 'POST',
        path: '/api/admin/test-endpoint',
        title: 'Sandbox request',
        description: 'SSRF-guarded server-side request to any public upstream URL. Returns status, headers, timing and a size-capped body.',
        auth: true,
        example: `curl -X POST '${origin}/api/admin/test-endpoint' \\\n  -H 'Authorization: Bearer $TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"url":"https://prexzyapis.com/search/youtube?q=music","method":"GET"}'`,
      },
      {
        group: 'Admin',
        method: 'GET',
        path: '/api/admin/database/export',
        title: 'JSON snapshot',
        description: 'Download a portable JSON snapshot of config, counters, logs, media and blocked IPs. Secrets and password hashes are omitted.',
        auth: true,
        example: `curl '${origin}/api/admin/database/export' -H 'Authorization: Bearer $TOKEN' -o snapshot.json`,
      },
      {
        group: 'Admin',
        method: 'DELETE',
        path: '/api/admin/security/ips/:ip',
        title: 'Unblock an IP',
        description: 'Remove an IP from the blocked list. Use GET /api/admin/security/ips to list current blocks.',
        auth: true,
        example: `curl -X DELETE '${origin}/api/admin/security/ips/203.0.113.10' -H 'Authorization: Bearer $TOKEN'`,
      },
    ],
    [origin]
  );

  const groups = ['All', ...Array.from(new Set(docs.map(doc => doc.group)))];
  const filtered = docs.filter(doc => {
    if (group !== 'All' && doc.group !== group) return false;
    if (!query.trim()) return true;
    const haystack = `${doc.method} ${doc.path} ${doc.title} ${doc.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight text-white">API reference</h1>
        <p className="mt-0.5 text-xs text-neutral-500">
          Public and administrative endpoints, with copy-ready cURL examples. Base URL: <code className="text-neutral-300">{origin}</code>
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-neutral-500" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter endpoints…"
            className="w-full bg-transparent text-sm text-white placeholder-neutral-600 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {groups.map(item => (
            <button
              key={item}
              onClick={() => setGroup(item)}
              className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold transition ${
                group === item ? 'border-neutral-600 bg-neutral-800 text-white' : 'border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map(doc => (
          <Card key={`${doc.method}-${doc.path}`} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={METHOD_TONES[doc.method]}>{doc.method}</Badge>
                  <code className="break-all text-[11px] font-semibold text-neutral-200">{doc.path}</code>
                  {doc.auth && <Lock className="h-3 w-3 text-amber-400" />}
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-white">{doc.title}</h3>
              </div>
              <CopyButton value={doc.example} label="cURL" />
            </div>
            <p className="mt-1.5 flex-1 text-[11px] leading-relaxed text-neutral-500">{doc.description}</p>
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 font-mono text-[10px] text-neutral-400">
              {doc.example}
            </pre>
            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-600">
              <span>{doc.group}{doc.auth ? ' · Bearer token' : ' · Public'}</span>
              {doc.group === 'Admin' && (
                <button onClick={() => onNavigate('sandbox')} className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300">
                  Try in sandbox <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="p-10 text-center text-xs text-neutral-500">No endpoints match “{query}”.</Card>
      )}

      <Card className="p-4">
        <SectionHeader title="Authentication" description="Admin endpoints require a bearer token." />
        <div className="grid gap-3 text-[11px] text-neutral-400 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <p className="mb-1 font-semibold text-neutral-200">1. Sign in</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-neutral-500">{`POST /api/admin/login\n{ "password": "…" }\n→ { "token": "…", "expiresAt": "…" }`}</pre>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <p className="mb-1 font-semibold text-neutral-200">2. Send the token</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-neutral-500">{`Authorization: Bearer <token>\n\nTokens are signed, stored server-side,\nrevocable and expire after the TTL.`}</pre>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-neutral-600">
          <span className="inline-flex items-center gap-1"><Server className="h-3 w-3" /> SSRF guards on all server-side fetches</span>
          <span className="inline-flex items-center gap-1"><Braces className="h-3 w-3" /> JSON errors include requestId</span>
          <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3" /> Rate limits return Retry-After</span>
          <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copy any example</span>
        </div>
      </Card>
    </div>
  );
};
