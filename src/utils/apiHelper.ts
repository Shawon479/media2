export interface ApiRequestInit extends RequestInit {
  /** Abort the request after this many milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Safely fetch an API endpoint, enforce a timeout and parse JSON.
 * Throws a readable error when the server returns an HTML error page.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: ApiRequestInit = {}
): Promise<ApiResponse<T>> {
  const { timeoutMs = 30_000, signal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromParent = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const text = await res.text();
    let data: any = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        const cleanText = text
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const snippet = cleanText.length > 160 ? `${cleanText.slice(0, 160)}…` : cleanText;
        throw new Error(
          !res.ok
            ? `Server error (HTTP ${res.status}): ${snippet || 'Invalid server response'}`
            : 'The server returned a non-JSON response.'
        );
      }
    }

    return { ok: res.ok, status: res.status, data };
  } catch (error: any) {
    if (timedOut || error?.name === 'AbortError') {
      throw new Error('The request timed out. Please check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

export function apiErrorMessage(data: any, fallback = 'Request failed.'): string {
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  return fallback;
}
