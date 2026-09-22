import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bulkSetStatus } from '@/api/client';
import type { Asset, AssetStatus, AssetPage } from '@/lib/types';

export interface BulkFeedback {
  type: 'success' | 'partial' | 'error';
  applied: number;
  failed: number;
  legalHoldIds: string[];
  conflictIds: string[];
  nextStatus: AssetStatus;
  retryConflicts?: () => Promise<void>;
  undoSuccesses?: () => Promise<void>;
}

export function useBulkOperations(allAssets: Asset[]) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<BulkFeedback | null>(null);

  const toggleSelect = useCallback(
    (id: string, shiftKey = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastSelectedId) {
          const lastIdx = allAssets.findIndex((a) => a.id === lastSelectedId);
          const currIdx = allAssets.findIndex((a) => a.id === id);

          if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);

            for (let i = start; i <= end; i++) {
              const item = allAssets[i];
              if (item) {
                next.add(item.id);
              }
            }
            return next;
          }
        }

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

      setLastSelectedId(id);
    },
    [allAssets, lastSelectedId],
  );

  const selectAllLoaded = useCallback(() => {
    setSelectedIds(new Set(allAssets.map((a) => a.id)));
  }, [allAssets]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  // Updates cache entries across infinite query pages
  const patchAssetStatusesInCache = useCallback(
    (updates: Map<string, { status: AssetStatus; asset?: Asset }>) => {
      queryClient.setQueriesData<{ pages: AssetPage[]; pageParams: unknown[] }>(
        { queryKey: ['assets'] },
        (oldData) => {
          if (!oldData?.pages) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => {
                const update = updates.get(item.id);
                if (update) {
                  return update.asset
                    ? update.asset
                    : { ...item, status: update.status, updatedAt: new Date().toISOString() };
                }
                return item;
              }),
            })),
          };
        },
      );
    },
    [queryClient],
  );

  const executeBulkStatus = useCallback(
    async (nextStatus: AssetStatus, targetIds?: string[]): Promise<void> => {
      const idsToUpdate = targetIds || Array.from(selectedIds);
      if (idsToUpdate.length === 0) return;

      setIsProcessing(true);

      // Snapshot original statuses for rollback
      const snapshotMap = new Map<string, AssetStatus>();
      for (const id of idsToUpdate) {
        const found = allAssets.find((a) => a.id === id);
        if (found) {
          snapshotMap.set(id, found.status);
        }
      }

      // Optimistic update: instantly update UI
      const optimisticUpdates = new Map<string, { status: AssetStatus }>();
      for (const id of idsToUpdate) {
        optimisticUpdates.set(id, { status: nextStatus });
      }
      patchAssetStatusesInCache(optimisticUpdates);

      try {
        const result = await bulkSetStatus(idsToUpdate, nextStatus, undefined, 2);

        const legalHoldIds: string[] = [];
        const conflictIds: string[] = [];
        const confirmedUpdates = new Map<string, { status: AssetStatus; asset?: Asset }>();
        const rollbacks = new Map<string, { status: AssetStatus }>();

        for (const res of result.results) {
          if (res.ok) {
            confirmedUpdates.set(res.id, { status: nextStatus, asset: res.asset });
          } else {
            if (res.code === 'legal_hold') {
              legalHoldIds.push(res.id);
            } else {
              conflictIds.push(res.id);
            }
            // Roll back failed asset to its previous status
            const originalStatus = snapshotMap.get(res.id);
            if (originalStatus) {
              rollbacks.set(res.id, { status: originalStatus });
            }
          }
        }

        // Apply server confirmations and selective rollbacks
        patchAssetStatusesInCache(confirmedUpdates);
        if (rollbacks.size > 0) {
          patchAssetStatusesInCache(rollbacks);
        }

        // Clear selection of successful assets, keep failed ones selected for easy retry
        if (result.failed > 0) {
          const remainingSelected = new Set([...legalHoldIds, ...conflictIds]);
          setSelectedIds(remainingSelected);
        } else {
          setSelectedIds(new Set());
        }

        // Set rich user feedback
        const bulkFeedback: BulkFeedback = {
          type: result.failed === 0 ? 'success' : result.applied > 0 ? 'partial' : 'error',
          applied: result.applied,
          failed: result.failed,
          legalHoldIds,
          conflictIds,
          nextStatus,
          retryConflicts:
            conflictIds.length > 0
              ? async () => {
                  setFeedback(null);
                  await executeBulkStatus(nextStatus, conflictIds);
                }
              : undefined,
          undoSuccesses:
            result.applied > 0
              ? async () => {
                  setFeedback(null);
                  const successfulIds = result.results.filter((r) => r.ok).map((r) => r.id);
                  const revertMap = new Map<string, { status: AssetStatus }>();
                  for (const id of successfulIds) {
                    const prevStatus = snapshotMap.get(id);
                    if (prevStatus) {
                      revertMap.set(id, { status: prevStatus });
                    }
                  }
                  patchAssetStatusesInCache(revertMap);
                }
              : undefined,
        };

        setFeedback(bulkFeedback);
      } catch (err) {
        // Complete failure rollback
        const fullRollback = new Map<string, { status: AssetStatus }>();
        for (const [id, originalStatus] of snapshotMap.entries()) {
          fullRollback.set(id, { status: originalStatus });
        }
        patchAssetStatusesInCache(fullRollback);

        setFeedback({
          type: 'error',
          applied: 0,
          failed: idsToUpdate.length,
          legalHoldIds: [],
          conflictIds: idsToUpdate,
          nextStatus,
          retryConflicts: async () => {
            setFeedback(null);
            await executeBulkStatus(nextStatus, idsToUpdate);
          },
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedIds, allAssets, patchAssetStatusesInCache],
  );

  return {
    selectedIds,
    toggleSelect,
    selectAllLoaded,
    clearSelection,
    executeBulkStatus,
    isProcessing,
    feedback,
    dismissFeedback,
  };
}
