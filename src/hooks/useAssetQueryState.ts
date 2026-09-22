import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { AssetQuery, AssetStatus, AssetKind } from '@/lib/types';

function parseUrlParams(): AssetQuery {
  if (typeof window === 'undefined') return { sort: 'updatedAt:desc' };
  const params = new URLSearchParams(window.location.search);

  const q = params.get('q') || undefined;
  const statusParam = params.get('status');
  const status = statusParam ? (statusParam.split(',').filter(Boolean) as AssetStatus[]) : undefined;

  const kindParam = params.get('kind');
  const kind = kindParam ? (kindParam.split(',').filter(Boolean) as AssetKind[]) : undefined;

  const tagParam = params.get('tag');
  const tag = tagParam ? tagParam.split(',').filter(Boolean) : undefined;

  const sort = (params.get('sort') as AssetQuery['sort']) || 'updatedAt:desc';
  const collectionId = params.get('collectionId') || undefined;
  const owner = params.get('owner') || undefined;

  return {
    q,
    status,
    kind,
    tag,
    sort,
    collectionId,
    owner,
  };
}

function syncUrl(query: AssetQuery) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status && query.status.length > 0) params.set('status', query.status.join(','));
  if (query.kind && query.kind.length > 0) params.set('kind', query.kind.join(','));
  if (query.tag && query.tag.length > 0) params.set('tag', query.tag.join(','));
  if (query.sort && query.sort !== 'updatedAt:desc') params.set('sort', query.sort);
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);

  const qs = params.toString();
  const targetUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;

  // Use replaceState to avoid cluttering history with intermediate keystrokes / filter flips
  if (window.location.search !== (qs ? `?${qs}` : '')) {
    window.history.replaceState(null, '', targetUrl);
  }
}

export function useAssetQueryState() {
  const [initial] = useState(() => parseUrlParams());
  const [searchInput, setSearchInput] = useState(initial.q || '');
  const [debouncedQ, setDebouncedQ] = useState(initial.q || '');
  const [status, setStatus] = useState<AssetStatus[]>(initial.status || []);
  const [kind, setKind] = useState<AssetKind[]>(initial.kind || []);
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>(initial.sort || 'updatedAt:desc');
  const [tag, setTag] = useState<string[]>(initial.tag || []);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input by 300ms
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQ(value.trim());
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedQ('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  const toggleStatus = useCallback((s: AssetStatus) => {
    setStatus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }, []);

  const toggleKind = useCallback((k: AssetKind) => {
    setKind((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }, []);

  const resetFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedQ('');
    setStatus([]);
    setKind([]);
    setTag([]);
    setSort('updatedAt:desc');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  // Assemble the current query object
  const query: AssetQuery = useMemo(
    () => ({
      q: debouncedQ || undefined,
      status: status.length > 0 ? status : undefined,
      kind: kind.length > 0 ? kind : undefined,
      tag: tag.length > 0 ? tag : undefined,
      sort,
    }),
    [debouncedQ, status, kind, tag, sort],
  );

  // Synchronize state changes to URL
  useEffect(() => {
    syncUrl(query);
  }, [query]);

  // Support browser Back/Forward navigation
  useEffect(() => {
    function onPopState() {
      const parsed = parseUrlParams();
      setSearchInput(parsed.q || '');
      setDebouncedQ(parsed.q || '');
      setStatus(parsed.status || []);
      setKind(parsed.kind || []);
      setSort(parsed.sort || 'updatedAt:desc');
      setTag(parsed.tag || []);
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return {
    query,
    searchInput,
    handleSearchChange,
    clearSearch,
    status,
    toggleStatus,
    kind,
    toggleKind,
    sort,
    setSort,
    tag,
    setTag,
    resetFilters,
  };
}
