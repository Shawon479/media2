import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Code2,
  History,
  Play,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { SystemConfig } from '../../types';
import { adminFetch } from './adminApi';
import {
  Badge,
  Card,
  CopyButton,
  EmptyState,
  Field,
  SectionHeader,
  Spinner,
  inputClass,
  selectClass,
} from './AdminUI';
import { formatDateTime, statusTone, truncate } from '../../utils/format';

interface AdminSandboxProps {
  token: string;
  config: SystemConfig | null;
  onSessionExpired: () => void;
  onError: (message: string) => void;
}

interface SandboxResult {
  statusCode: number;
  statusText: string;
  latencyMs: number;
  contentType: string;
  bytes: number;
  truncated: boolean;
  headers: Record<string, string>;
  data: unknown;
}

interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  statusCode: number;
  latencyMs: number;
  at: string;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const AdminSandbox: React.FC<AdminSandboxProps> = ({ token, config, onSessionExpired, onError }) => {
  const base = config?.baseUrl || 'https://prexzyapis.com';
  const presets = useMemo(
    () => [
      {
        name: 'YouTube video (ytmp4)',
        method: 'GET',
        url: `${base}/download/ytmp4?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`,
        body: '',
      },
      {
        name: 'YouTube audio (ytmp3)',
        method: 'GET',
        url: `${base}/download/ytmp3?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`,
        body: '',
      },
      {
        name: 'YouTube info (ytinfo)',
        method: 'GET',
        url: `${base}/download/ytinfo?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`,
        body: '',
      },
      {
        name: 'Terabox folder',
        method: 'GET',
        url: `${base}/download/terabox?url=${encodeURIComponent('https://www.1024tera.com/s/1pLY_llmDlklU2tYse8gEig')}`,
        body: '',
      },
      {
        name: 'Facebook (POST)',
        method: 'POST',
        url: `${base}/download/facebookv2`,
        body: JSON.stringify({ url: 'https://www.facebook.com/reel/1234' }, null, 2),
      },
      {
        name: 'Pinterest search',
        method: 'GET',
        url: `${base}/search/pinterest?q=${encodeURIComponent('architecture')}`,
        body: '',
      },
      {
        name: 'YouTube search',
        method: 'GET',
        url: `${base}/search/youtube?q=${encodeURIComponent('lofi beats')}`,
        body: '',
      },
    ],
    [base]
  );

  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState(presets[0].url);
  const [bodyText, setBodyText] = useState('');
  const [headersText, setHeadersText] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [showHeaders, setShowHeaders] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const applyPreset = (preset: (typeof presets)[number]) => {
    setMethod(preset.method);
    setUrl(preset.url);
    setBodyText(preset.body);
    setError('');
    setResult(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError('');

    try {
      let headers: Record<string, string> = {};
      if (headersText.trim()) {
        const parsed = JSON.parse(headersText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Headers must be a JSON object.');
        }
        headers = parsed;
      }

      let parsedBody: unknown = undefined;
      if (!['GET', 'HEAD'].includes(method) && bodyText.trim()) {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }
      }

      const response = await adminFetch<SandboxResult>('/api/admin/test-endpoint', token, {
        method: 'POST',
        body: { url: url.trim(), method, body: parsedBody, headers },
      });

      setResult(response);
      setHistory(prev => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          method,
          url: url.trim(),
          statusCode: response.statusCode,
          latencyMs: response.latencyMs,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 8));
    } catch (requestError: any) {
      if (requestError?.name === 'SessionExpiredError') return onSessionExpired();
      if (requestError instanceof SyntaxError) {
        setError('Headers/body JSON is malformed.');
      } else {
        setError(requestError.message || 'The sandbox request failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const curl = useMemo(() => {
    const lines = [`curl -X ${method} '${url}'`];
    try {
      const parsed = JSON.parse(headersText || '{}');
      for (const [key, value] of Object.entries(parsed)) {
        lines.push(`  -H '${key}: ${String(value).replace(/'/g, "'\\''")}'`);
      }
    } catch {
      // ignore invalid headers in preview
    }
    if (!['GET', 'HEAD'].includes(method) && bodyText.trim()) {
      lines.push(`  --data '${bodyText.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }, [method, url, headersText, bodyText]);

  const prettyData = useMemo(() => {
    if (!result) return '';
    if (typeof result.data === 'string') return result.data;
    try {
      return JSON.stringify(result.data, null, 2);
    } catch {
      return String(result.data);
    }
  }, [result]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight text-white">API sandbox</h1>
        <p className="mt-0.5 text-xs text-neutral-500">
          Send a request through the SSRF-guarded admin proxy to test any upstream gateway endpoint.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <Field label="Method" className="w-28">
                <select value={method} onChange={event => setMethod(event.target.value)} className={selectClass}>
                  {METHODS.map(item => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Request URL" className="flex-1">
                <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://gateway.example/api/..." className={inputClass} />
              </Field>
            </div>

            <Field label="Headers (JSON)" hint="Hop-by-hop headers are stripped. Use {} for none.">
              <textarea
                value={headersText}
                onChange={event => setHeadersText(event.target.value)}
                rows={3}
                spellCheck={false}
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>

            {!['GET', 'HEAD'].includes(method) && (
              <Field label="Request body (JSON or raw text)">
                <textarea
                  value={bodyText}
                  onChange={event => setBodyText(event.target.value)}
                  rows={5}
                  spellCheck={false}
                  placeholder='{"url":"https://..."}'
                  className={`${inputClass} font-mono text-xs`}
                />
              </Field>
            )}

            {error && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {presets.slice(0, 4).map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-[10px] font-medium text-neutral-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                {loading ? <Spinner className="h-3.5 w-3.5" /> : <SendIcon />}
                {loading ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>

          <div className="mt-4 border-t border-neutral-800 pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">cURL equivalent</span>
              <CopyButton value={curl} label="Copy cURL" />
            </div>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 font-mono text-[10px] text-neutral-500">
              {curl}
            </pre>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionHeader title="Response" description={result ? `${formatDateTime(new Date())} · ${result.bytes} bytes` : 'Run a request to inspect the response.'} />
            {!result ? (
              <EmptyState icon={Terminal} title="No response yet" description="Pick a preset or enter an upstream endpoint." />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(result.statusCode)}>{result.statusCode} {result.statusText}</Badge>
                  <Badge>{result.latencyMs} ms</Badge>
                  <Badge>{result.bytes} bytes</Badge>
                  {result.truncated && <Badge tone="bg-amber-500/10 text-amber-300 border-amber-500/20">Truncated</Badge>}
                  <CopyButton value={prettyData} label="Copy body" className="ml-auto" />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Body</p>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-[10px] text-neutral-300">
                    {prettyData || '(empty response body)'}
                  </pre>
                </div>
                <div>
                  <button
                    onClick={() => setShowHeaders(value => !value)}
                    className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 transition hover:text-neutral-300"
                  >
                    Response headers ({Object.keys(result.headers).length})
                    {showHeaders ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {showHeaders && (
                    <div className="mt-1.5 max-h-40 space-y-1 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-2.5">
                      {Object.entries(result.headers).map(([key, value]) => (
                        <div key={key} className="flex gap-2 font-mono text-[10px]">
                          <span className="w-40 shrink-0 text-neutral-500">{key}</span>
                          <span className="break-all text-neutral-400">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeader title="Recent sandbox calls" description="This session only." action={history.length > 0 ? <button onClick={() => setHistory([])} className="text-[10px] text-neutral-500 hover:text-red-300">Clear</button> : undefined} />
            {history.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-xs text-neutral-500"><History className="h-4 w-4" /> No calls yet.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setMethod(entry.method);
                      setUrl(entry.url);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-2.5 py-2 text-left transition hover:border-neutral-700"
                  >
                    <Badge tone={statusTone(entry.statusCode)}>{entry.statusCode}</Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-400">{entry.method} {truncate(entry.url, 52)}</span>
                    <span className="shrink-0 text-[10px] text-neutral-600">{entry.latencyMs}ms</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <SectionHeader title="More presets" description="Apply a complete request template." />
        <div className="flex flex-wrap gap-2">
          {presets.map(preset => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
            >
              <Code2 className="h-3 w-3" /> {preset.name}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};

const SendIcon: React.FC = () => <Play className="h-3.5 w-3.5 fill-current" />;
