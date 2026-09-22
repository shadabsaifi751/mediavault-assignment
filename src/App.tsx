import { useState, useCallback, useEffect } from 'react';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { BulkActionBar } from '@/features/assets/BulkActionBar';
import { StatsBar } from '@/features/stats/StatsBar';
import { useAssetQueryState } from '@/hooks/useAssetQueryState';
import { useAssetsQuery } from '@/features/assets/useAssetsQuery';
import { useBulkOperations } from '@/features/assets/useBulkOperations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAssetEvents } from '@/hooks/useAssetEvents';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetKind } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const KINDS: AssetKind[] = ['image', 'video', 'document'];

const SORTS = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'name:desc', label: 'Name (Z–A)' },
  { value: 'sizeBytes:desc', label: 'Largest file size' },
  { value: 'createdAt:desc', label: 'Newest created' },
] as const;

export function App() {
  const {
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
    resetFilters,
  } = useAssetQueryState();

  const {
    assets,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useAssetsQuery(query);

  const {
    selectedIds,
    toggleSelect,
    selectAllLoaded,
    clearSelection,
    executeBulkStatus,
    isProcessing: isBulkProcessing,
    feedback,
    dismissFeedback,
  } = useBulkOperations(assets);

  const { isOnline } = useNetworkStatus();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Enable live SSE stream updates
  useAssetEvents(true);

  // Announce result counts to screen readers when query completes
  useEffect(() => {
    if (!isLoading && !error) {
      setLiveAnnouncement(`${total.toLocaleString()} assets available`);
    }
  }, [total, isLoading, error]);

  // Handle when asset is saved in detail panel
  const handleSaved = useCallback(
    (_updatedAsset: Asset) => {
      // Handled automatically by query cache updates in detail panel
    },
    [],
  );

  const handleApplyBulkStatus = useCallback(
    (nextStatus: AssetStatus) => {
      executeBulkStatus(nextStatus);
    },
    [executeBulkStatus],
  );

  const hasActiveFilters =
    Boolean(query.q) ||
    (query.status && query.status.length > 0) ||
    (query.kind && query.kind.length > 0) ||
    query.sort !== 'updatedAt:desc';

  return (
    <div className="app">
      {/* Screen Reader Live Region */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveAnnouncement}
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <aside className="offline-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>You are currently working offline. Cached assets remain available; actions will resume when online.</span>
        </aside>
      )}

      {/* Header Bar */}
      <header className="topbar">
        <div className="topbar__left">
          <div className="brand">
            <div className="brand__logo" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <h1 className="brand__title">MediaVault</h1>
          </div>
          <StatsBar />
        </div>

        <div className="topbar__center">
          <div className="search-wrapper">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="search-input"
              type="search"
              placeholder="Search assets by name or tag (300ms debounce)..."
              value={searchInput}
              aria-label="Search assets by name or tag"
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="search-clear"
                onClick={clearSearch}
                aria-label="Clear search input"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="topbar__right">
          <label className="sort-label">
            <span className="muted text-xs">Sort:</span>
            <select
              className="select-sort"
              value={sort}
              aria-label="Sort assets"
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Filter Controls Toolbar */}
      <section className="filters-bar" aria-label="Asset filters">
        <div className="filters-group">
          <span className="filters-label text-xs muted">Type:</span>
          <div className="filter-chips">
            {KINDS.map((k) => {
              const active = kind.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`chip ${active ? 'chip--active' : ''}`}
                  onClick={() => toggleKind(k)}
                  aria-pressed={active}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        <div className="filters-divider" aria-hidden="true" />

        <div className="filters-group">
          <span className="filters-label text-xs muted">Status:</span>
          <div className="filter-checkboxes">
            {STATUSES.map((s) => {
              const checked = status.includes(s);
              return (
                <label key={s} className={`filter-checkbox ${checked ? 'filter-checkbox--active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStatus(s)}
                  />
                  <span>{statusLabel(s)}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="filters-status-summary">
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn--link text-xs"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          )}
          <span className="count-badge" aria-live="polite">
            {isLoading && assets.length === 0 ? (
              'Loading assets...'
            ) : (
              <>
                <strong>{assets.length}</strong> of <strong>{total.toLocaleString()}</strong> assets
              </>
            )}
          </span>
        </div>
      </section>

      {/* Floating Bulk Action Bar & Feedback */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalLoaded={assets.length}
        isProcessing={isBulkProcessing}
        feedback={feedback}
        onApplyStatus={handleApplyBulkStatus}
        onSelectAll={selectAllLoaded}
        onClearSelection={clearSelection}
        onDismissFeedback={dismissFeedback}
      />

      {/* Main Content Layout */}
      <main className="main-viewport">
        <div className={`grid-wrapper ${activeId ? 'grid-wrapper--panel-open' : ''}`}>
          <AssetGrid
            assets={assets}
            selectedIds={selectedIds}
            activeId={activeId}
            onToggleSelect={toggleSelect}
            onOpen={setActiveId}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
            error={error}
            onRetry={refetch}
            onResetFilters={resetFilters}
          />
        </div>

        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={() => setActiveId(null)}
            onSaved={handleSaved}
          />
        )}
      </main>
    </div>
  );
}
