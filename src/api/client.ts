import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';
import { ApiError, isRetryableError } from './errors';

interface RequestOptions extends RequestInit {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  dedupe?: boolean;
}

const inFlightGetRequests = new Map<string, Promise<unknown>>();

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function computeBackoffWithJitter(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  retryAfterSec?: number,
): number {
  if (typeof retryAfterSec === 'number' && retryAfterSec > 0) {
    return retryAfterSec * 1000 + Math.floor(Math.random() * 250);
  }
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  // Full jitter: uniformly distributed between 0 and exponential delay
  return Math.floor(Math.random() * exponential);
}

export function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 400,
    maxDelayMs = 4000,
    dedupe = false,
    signal,
    headers,
    method = 'GET',
    ...restInit
  } = options;

  const isGet = method.toUpperCase() === 'GET';
  if (isGet && dedupe && inFlightGetRequests.has(path)) {
    return inFlightGetRequests.get(path) as Promise<T>;
  }

  const execute = async (): Promise<T> => {
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const res = await fetch(path, {
          method,
          signal,
          headers: {
            'content-type': 'application/json',
            ...(headers ?? {}),
          },
          ...restInit,
        });

        const requestId = res.headers.get('x-request-id') ?? undefined;
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

        if (!res.ok) {
          let code = 'unknown_error';
          let message = res.statusText || 'Request failed';

          try {
            const body = await res.json();
            if (body?.error) {
              code = body.error.code ?? code;
              message = body.error.message ?? message;
            }
          } catch {
            // Non-JSON response
          }

          const apiError = new ApiError(res.status, code, message, retryAfterSec, requestId);

          if (apiError.isRetryable && attempt < maxRetries) {
            const delay = computeBackoffWithJitter(attempt, baseDelayMs, maxDelayMs, retryAfterSec);
            attempt += 1;
            await sleep(delay, signal);
            continue;
          }

          throw apiError;
        }

        if (res.status === 204) {
          return null as T;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }

        if (isRetryableError(err) && attempt < maxRetries) {
          const delay = computeBackoffWithJitter(attempt, baseDelayMs, maxDelayMs);
          attempt += 1;
          await sleep(delay, signal);
          continue;
        }

        throw err;
      }
    }
  };

  const promise = execute();

  if (isGet && dedupe) {
    inFlightGetRequests.set(path, promise);
    promise.finally(() => {
      inFlightGetRequests.delete(path);
    });
  }

  return promise;
}

export function listAssets(query: AssetQuery, signal?: AbortSignal): Promise<AssetPage> {
  const qs = toSearchParams(query);
  return request<AssetPage>(`/api/assets?${qs}`, { signal, dedupe: true });
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal, dedupe: true });
}

export async function getAssetsByIds(ids: string[], signal?: AbortSignal): Promise<{ items: Asset[]; missing: string[] }> {
  if (ids.length === 0) {
    return { items: [], missing: [] };
  }

  // The server rejects >25 ids per batch request
  const BATCH_SIZE = 25;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      request<{ items: Asset[]; missing: string[] }>(`/api/assets/batch?ids=${chunk.join(',')}`, {
        signal,
        dedupe: true,
      }),
    ),
  );

  const items: Asset[] = [];
  const missing: string[] = [];
  for (const res of results) {
    items.push(...res.items);
    missing.push(...res.missing);
  }

  return { items, missing };
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
    signal,
    maxRetries: 3,
  });
}

/**
 * Executes bulk status updates respecting the 50-item hard cap,
 * with bounded concurrency (default concurrency = 2) to prevent rate limits.
 */
export async function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  signal?: AbortSignal,
  concurrency = 2,
): Promise<BulkResult> {
  if (ids.length === 0) {
    return { results: [], applied: 0, failed: 0 };
  }

  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }

  const chunkResults: BulkResult[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < chunks.length) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const currentIndex = index++;
      const batchIds = chunks[currentIndex];

      const res = await request<BulkResult>('/api/assets/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids: batchIds, status }),
        signal,
      });

      chunkResults[currentIndex] = res;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker());
  await Promise.all(workers);

  const allResults: BulkResult['results'] = [];
  let applied = 0;
  let failed = 0;

  for (const chunk of chunkResults) {
    if (!chunk) continue;
    allResults.push(...chunk.results);
    applied += chunk.applied;
    failed += chunk.failed;
  }

  return {
    results: allResults,
    applied,
    failed,
  };
}

export interface FacetsResponse {
  tags: string[];
  owners: Array<{ id: string; name: string }>;
  statuses: Asset['status'][];
  kinds: Asset['kind'][];
}

export function getFacets(signal?: AbortSignal): Promise<FacetsResponse> {
  return request<FacetsResponse>('/api/facets', { signal, dedupe: true });
}

export interface StatsResponse {
  total: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  totalBytes: number;
}

export function getStats(signal?: AbortSignal): Promise<StatsResponse> {
  return request<StatsResponse>('/api/stats', { signal, dedupe: true });
}

export const thumbnailUrl = (id: string): string => `/api/thumb/${id}.svg`;
