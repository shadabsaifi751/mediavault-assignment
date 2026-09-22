import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset, AssetPage } from '@/lib/types';

export function useAssetEvents(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('asset.updated', (e) => {
        try {
          const updatedAsset: Asset = JSON.parse(e.data);

          // Update asset in cache across all infinite pages without modifying page structure or scroll
          queryClient.setQueriesData<{ pages: AssetPage[]; pageParams: unknown[] }>(
            { queryKey: ['assets'] },
            (old) => {
              if (!old?.pages) return old;

              return {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.id === updatedAsset.id ? updatedAsset : item,
                  ),
                })),
              };
            },
          );

          // Also update detail query if active
          queryClient.setQueryData(['asset', updatedAsset.id], updatedAsset);
        } catch {
          // Ignore malformed SSE frames
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        // Exponential/delayed reconnect
        reconnectTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [enabled, queryClient]);
}
