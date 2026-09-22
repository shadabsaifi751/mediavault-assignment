import React, { memo, useState, useCallback } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  isActive: boolean;
  isFocused: boolean;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onOpen: (id: string) => void;
  onCardFocus: (index: number) => void;
  index: number;
}

function StatusIcon({ status }: { status: AssetStatus }) {
  switch (status) {
    case 'draft':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      );
    case 'in_review':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'approved':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'archived':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="5" rx="1" />
          <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
          <path d="M10 13h4" />
        </svg>
      );
  }
}

function KindIcon({ kind }: { kind: Asset['kind'] }) {
  switch (kind) {
    case 'video':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      );
    case 'document':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
  }
}

export const AssetCard = memo(function AssetCard({
  asset,
  isSelected,
  isActive,
  isFocused,
  onToggleSelect,
  onOpen,
  onCardFocus,
  index,
}: AssetCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const handleImageError = useCallback(() => {
    setImageFailed(true);
  }, []);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // If user holds Shift when clicking anywhere on the card, trigger range selection
      if (e.shiftKey) {
        onToggleSelect(asset.id, true);
        return;
      }
      onOpen(asset.id);
    },
    [asset.id, onOpen, onToggleSelect],
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onToggleSelect(asset.id, e.shiftKey);
    },
    [asset.id, onToggleSelect],
  );

  const isLegalHold = asset.tags.includes('legal-hold');

  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      data-index={index}
      data-id={asset.id}
      className={`card ${isSelected ? 'card--selected' : ''} ${isActive ? 'card--active' : ''} ${
        isFocused ? 'card--focused' : ''
      }`}
      onClick={handleCardClick}
      onFocus={() => onCardFocus(index)}
    >
      <div className="card__thumb-container">
        {asset.hasThumbnail && !imageFailed ? (
          <img
            className="card__thumb"
            src={thumbnailUrl(asset.id)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        ) : (
          <div className="card__thumb-fallback" aria-hidden="true">
            <KindIcon kind={asset.kind} />
            <span className="fallback-id">{asset.id}</span>
          </div>
        )}

        <label
          className="card__check-label"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="card__check"
            checked={isSelected}
            aria-label={`Select asset ${asset.name}`}
            onClick={handleCheckboxClick}
            onChange={() => {}} // Click handles both regular and shift clicks
          />
        </label>

        {isLegalHold && (
          <span className="card__hold-badge" title="Legal Hold: Restricted modification">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Hold
          </span>
        )}
      </div>

      <div className="card__body">
        <div className="card__header">
          <p className="card__name" title={asset.name}>
            {asset.name}
          </p>
          <span className={`pill pill--${asset.status}`}>
            <StatusIcon status={asset.status} />
            {statusLabel(asset.status)}
          </span>
        </div>

        <div className="card__meta muted">
          <span className="meta-item">
            <KindIcon kind={asset.kind} />
            {asset.kind}
          </span>
          <span className="meta-divider">·</span>
          <span className="meta-item">{formatBytes(asset.sizeBytes)}</span>
          <span className="meta-divider">·</span>
          <span className="meta-item">{formatDate(asset.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
});
