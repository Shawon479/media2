export class SessionExpiredError extends Error {
  constructor(message = 'Your admin session expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly data?: unknown) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export interface AdminRequestInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function adminFetch<T = any>(
  path: string,
  token: string,
  init: AdminRequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  let body = init.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    body: body as BodyInit | null | undefined,
    signal: init.signal ?? AbortSignal.timeout(45_000),
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.status === 401) throw new SessionExpiredError();
      throw new AdminApiError(
        response.ok ? 'The server returned a non-JSON response.' : `HTTP ${response.status}: ${text.slice(0, 120)}`,
        response.status,
        text
      );
    }
  }

  if (response.status === 401) {
    throw new SessionExpiredError(data?.error);
  }

  if (!response.ok) {
    throw new AdminApiError(data?.error || data?.message || `Request failed (HTTP ${response.status}).`, response.status, data);
  }

  return data as T;
}

export async function adminDownload(path: string, token: string, fallbackName: string): Promise<void> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) throw new SessionExpiredError();

  if (!response.ok) {
    const text = await response.text();
    let message = `Download failed (HTTP ${response.status}).`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) message = parsed.error;
    } catch {
      if (text) message = text.slice(0, 180);
    }
    throw new AdminApiError(message, response.status);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
