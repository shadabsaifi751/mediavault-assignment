import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AssetCard } from './AssetCard';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onOpen: (id: string) => void;
  onSelectRange?: (startId: string, endId: string) => void;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: Error | null;
  onRetry?: () => void;
  onResetFilters?: () => void;
}

const CARD_MIN_WIDTH = 260;
const GAP = 20;
const CARD_ROW_HEIGHT = 275; // Card height (255px) + vertical gap (20px)

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error,
  onRetry,
  onResetFilters,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // ResizeObserver to calculate dynamic columns count
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth || 1000);

    return () => observer.disconnect();
  }, []);

  const columns = useMemo(() => {
    const cols = Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP));
    return Math.max(1, Math.min(6, cols));
  }, [containerWidth]);

  const rowCount = useMemo(() => {
    return Math.ceil(assets.length / columns);
  }, [assets.length, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ROW_HEIGHT,
    overscan: 3,
  });

  // Infinite scroll trigger
  const virtualRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    if (virtualRows.length === 0) return;
    const lastVisibleRow = virtualRows[virtualRows.length - 1];
    if (lastVisibleRow && lastVisibleRow.index >= rowCount - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Keyboard navigation across the virtual grid
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (assets.length === 0) return;

      let nextIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          nextIndex = Math.min(assets.length - 1, focusedIndex + 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
          nextIndex = Math.max(0, focusedIndex - 1);
          e.preventDefault();
          break;
        case 'ArrowDown':
          nextIndex = Math.min(assets.length - 1, focusedIndex + columns);
          e.preventDefault();
          break;
        case 'ArrowUp':
          nextIndex = Math.max(0, focusedIndex - columns);
          e.preventDefault();
          break;
        case 'Home':
          nextIndex = 0;
          e.preventDefault();
          break;
        case 'End':
          nextIndex = assets.length - 1;
          e.preventDefault();
          break;
        case ' ': // Space toggles selection
          e.preventDefault();
          if (assets[focusedIndex]) {
            onToggleSelect(assets[focusedIndex].id, e.shiftKey);
          }
          return;
        case 'Enter': // Enter opens detail panel
          e.preventDefault();
          if (assets[focusedIndex]) {
            onOpen(assets[focusedIndex].id);
          }
          return;
        default:
          return;
      }

      if (nextIndex !== focusedIndex) {
        setFocusedIndex(nextIndex);
        const targetRow = Math.floor(nextIndex / columns);
        rowVirtualizer.scrollToIndex(targetRow, { align: 'auto' });

        // If user held Shift while navigating, extend selection range
        const nextAsset = assets[nextIndex];
        if (e.shiftKey && nextAsset) {
          onToggleSelect(nextAsset.id, true);
        }

        // Focus the newly active card element after DOM sync
        requestAnimationFrame(() => {
          const cardEl = parentRef.current?.querySelector<HTMLElement>(`[data-index="${nextIndex}"]`);
          cardEl?.focus();
        });
      }
    },
    [assets, focusedIndex, columns, onToggleSelect, onOpen, rowVirtualizer],
  );

  // Keep focusedIndex in bounds when assets change
  useEffect(() => {
    if (focusedIndex >= assets.length && assets.length > 0) {
      setFocusedIndex(assets.length - 1);
    }
  }, [assets.length, focusedIndex]);

  // Loading Skeleton
  if (isLoading && assets.length === 0) {
    return (
      <div className="grid-viewport" ref={parentRef}>
        <div className="grid-skeleton">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card-skeleton" aria-hidden="true">
              <div className="skeleton-thumb" />
              <div className="skeleton-body">
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line skeleton-line--meta" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (error && assets.length === 0) {
    return (
      <div className="grid-viewport state-container" ref={parentRef}>
        <div className="error-card" role="alert">
          <div className="error-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3>Failed to load assets</h3>
          <p className="muted">{error.message || 'The server encountered an error while retrieving assets.'}</p>
          {onRetry && (
            <button className="btn btn--primary" onClick={onRetry}>
              Retry Query
            </button>
          )}
        </div>
      </div>
    );
  }

  // Empty State
  if (assets.length === 0) {
    return (
      <div className="grid-viewport state-container" ref={parentRef}>
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3>No assets match your search</h3>
          <p className="muted">Try adjusting your filters, searching for a different keyword, or resetting all filters.</p>
          {onResetFilters && (
            <button className="btn btn--secondary" onClick={onResetFilters}>
              Reset all filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid-viewport"
      ref={parentRef}
      role="grid"
      aria-label="Media assets grid"
      aria-rowcount={rowCount}
      aria-colcount={columns}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="virtual-scroll-canvas"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowAssets = assets.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              role="row"
              aria-rowindex={virtualRow.index + 1}
              className="virtual-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size - GAP}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${GAP}px`,
              }}
            >
              {rowAssets.map((asset, colIndex) => {
                const globalIndex = startIndex + colIndex;
                return (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    index={globalIndex}
                    isSelected={selectedIds.has(asset.id)}
                    isActive={activeId === asset.id}
                    isFocused={focusedIndex === globalIndex}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                    onCardFocus={setFocusedIndex}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="grid-loading-indicator" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <span>Loading more assets...</span>
        </div>
      )}
    </div>
  );
}
