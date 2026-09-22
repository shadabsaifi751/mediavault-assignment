import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { listAssets } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { AssetQuery, AssetPage } from '@/lib/types';
import { useMemo } from 'react';

export function useAssetsQuery(query: AssetQuery) {
  const queryClient = useQueryClient();

  // Normalize query object for stable query keys
  const normalizedQuery = useMemo(() => {
    return {
      q: query.q || undefined,
      status: query.status && query.status.length > 0 ? [...query.status].sort().join(',') : undefined,
      kind: query.kind && query.kind.length > 0 ? [...query.kind].sort().join(',') : undefined,
      tag: query.tag && query.tag.length > 0 ? [...query.tag].sort().join(',') : undefined,
      sort: query.sort || 'updatedAt:desc',
    };
  }, [query.q, query.status, query.kind, query.tag, query.sort]);

  const infiniteQuery = useInfiniteQuery<AssetPage, ApiError>({
    queryKey: ['assets', normalizedQuery],
    queryFn: async ({ pageParam, signal }) => {
      return listAssets(
        {
          ...query,
          limit: 32,
          cursor: (pageParam as string | undefined) || undefined,
        },
        signal,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
  });

  const assets = useMemo(() => {
    if (!infiniteQuery.data) return [];
    return infiniteQuery.data.pages.flatMap((page) => page.items);
  }, [infiniteQuery.data]);

  const total = infiniteQuery.data?.pages[0]?.total ?? 0;

  return {
    ...infiniteQuery,
    assets,
    total,
    queryClient,
    normalizedQuery,
  };
}
