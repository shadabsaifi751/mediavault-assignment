import { useEffect, useState, useRef, useCallback } from 'react';
import { getAsset, thumbnailUrl, updateAsset } from '@/api/client';
import { ApiError } from '@/api/errors';
import { formatBytes, formatDate, formatDuration, statusLabel } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({ id, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus restoration & Escape key handler
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Shift focus into close button after render
    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to card if still connected to document
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, [onClose]);

  // Fetch asset details
  const fetchCurrentAsset = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setErrorMessage(null);
      setImageFailed(false);
      try {
        const data = await getAsset(id, signal);
        setAsset(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof ApiError ? err.userMessage : err instanceof Error ? err.message : 'Failed to load asset';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentAsset(controller.signal);
    return () => controller.abort();
  }, [fetchCurrentAsset]);

  // Update status with 409 version conflict recovery
  async function handleSetStatus(newStatus: AssetStatus) {
    if (!asset || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setConflictWarning(null);

    try {
      const updated = await updateAsset(asset.id, asset.version, { status: newStatus });
      setAsset(updated);
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') {
        // Handle 409 version conflict: re-fetch latest asset data and alert the user
        setConflictWarning(
          'Version Conflict: Another user or process updated this asset. Latest version has been reloaded below.',
        );
        try {
          const latest = await getAsset(asset.id);
          setAsset(latest);
          onSaved(latest);
        } catch {
          setErrorMessage('Failed to reload latest asset version after conflict.');
        }
      } else {
        const msg =
          err instanceof ApiError
            ? err.userMessage
            : err instanceof Error
            ? err.message
            : 'Failed to update asset';
        setErrorMessage(msg);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const isLegalHold = asset?.tags.includes('legal-hold');

  return (
    <aside
      className="detail-panel"
      role="complementary"
      aria-label="Asset detail panel"
    >
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button
          ref={closeButtonRef}
          className="btn-icon"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="panel__content">
        {conflictWarning && (
          <div className="notice-box notice-box--warning" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p>{conflictWarning}</p>
          </div>
        )}

        {errorMessage && (
          <div className="notice-box notice-box--error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{errorMessage}</p>
          </div>
        )}

        {isLoading && (
          <div className="panel-loading">
            <div className="spinner" aria-hidden="true" />
            <p className="muted">Loading asset details...</p>
          </div>
        )}

        {asset && (
          <div className="panel__body">
            <div className="panel__preview-container">
              {asset.hasThumbnail && !imageFailed ? (
                <img
                  className="panel__thumb"
                  src={thumbnailUrl(asset.id)}
                  alt={asset.name}
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="panel__thumb-fallback" aria-hidden="true">
                  <span>{asset.kind.toUpperCase()}</span>
                  <span className="fallback-id">{asset.id}</span>
                </div>
              )}
            </div>

            <div className="panel__title-block">
              <h3>{asset.name}</h3>
              <span className={`pill pill--${asset.status}`}>
                {statusLabel(asset.status)}
              </span>
            </div>

            {isLegalHold && (
              <div className="hold-banner" role="status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span><strong>Legal Hold Active:</strong> Modifications and archiving are restricted.</span>
              </div>
            )}

            <div className="panel__section">
              <h4>Attributes</h4>
              <dl className="facts-grid">
                <div className="fact-item">
                  <dt>Asset ID</dt>
                  <dd><code>{asset.id}</code></dd>
                </div>
                <div className="fact-item">
                  <dt>Type</dt>
                  <dd className="capitalize">{asset.kind}</dd>
                </div>
                <div className="fact-item">
                  <dt>File Size</dt>
                  <dd>{formatBytes(asset.sizeBytes)}</dd>
                </div>
                {asset.width && asset.height && (
                  <div className="fact-item">
                    <dt>Resolution</dt>
                    <dd>{asset.width} × {asset.height}</dd>
                  </div>
                )}
                {asset.durationSec && (
                  <div className="fact-item">
                    <dt>Duration</dt>
                    <dd>{formatDuration(asset.durationSec)}</dd>
                  </div>
                )}
                <div className="fact-item">
                  <dt>Owner</dt>
                  <dd>{asset.owner.name}</dd>
                </div>
                <div className="fact-item">
                  <dt>Last Modified</dt>
                  <dd>{formatDate(asset.updatedAt)}</dd>
                </div>
                <div className="fact-item">
                  <dt>Version</dt>
                  <dd>v{asset.version}</dd>
                </div>
              </dl>
            </div>

            {asset.tags.length > 0 && (
              <div className="panel__section">
                <h4>Tags</h4>
                <div className="tags-list">
                  {asset.tags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="panel__section">
              <h4>Change Status</h4>
              <div className="status-button-group">
                {STATUSES.map((status) => {
                  const isCurrent = status === asset.status;
                  const isRestrictedArchive = isLegalHold && status === 'archived';

                  return (
                    <button
                      key={status}
                      className={`btn btn--status ${isCurrent ? 'btn--current' : ''}`}
                      disabled={isSaving || isCurrent || isRestrictedArchive}
                      onClick={() => handleSetStatus(status)}
                      title={
                        isRestrictedArchive
                          ? 'Assets on legal hold cannot be archived'
                          : undefined
                      }
                    >
                      {statusLabel(status)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
