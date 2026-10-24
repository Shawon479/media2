import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { Spinner } from './AdminUI';

interface AdminLoginProps {
  onSuccess: (token: string, expiresAt: string) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.token) {
        setError(data?.error || `Login failed (HTTP ${response.status}).`);
        return;
      }

      onSuccess(data.token, data.expiresAt);
    } catch {
      setError('Could not reach the server. Check that the API is running and try again.');
    } finally {
      setLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow-2xl sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-400/10 text-amber-300">
          <Lock className="h-5 w-5" />
        </div>

        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold tracking-tight text-white">Admin console</h1>
          <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
            Secure
          </span>
        </div>
        <p className="mt-1.5 text-sm text-neutral-400">
          Sign in to manage traffic, media, security and feature flags.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Admin password
            </span>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                placeholder="Enter your admin password"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 py-2.5 pl-10 pr-11 text-sm text-white placeholder-neutral-600 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/70 bg-red-950/50 px-3 py-2.5 text-xs text-red-200" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Spinner /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? 'Verifying…' : 'Sign in securely'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-6 grid gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-[11px] leading-relaxed text-neutral-500">
          <p className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Passwords are stored as scrypt hashes. Sessions are signed, expire automatically and can be revoked.
          </p>
          <p className="flex items-start gap-1.5">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Repeated failures are rate-limited. Credentials are configured in the server environment — never in the
            browser bundle.
          </p>
        </div>
      </div>
    </div>
  );
};
