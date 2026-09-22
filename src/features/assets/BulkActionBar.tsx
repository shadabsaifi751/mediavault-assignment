import type { AssetStatus } from '@/lib/types';
import { statusLabel } from '@/lib/format';
import type { BulkFeedback } from './useBulkOperations';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  selectedCount: number;
  totalLoaded: number;
  isProcessing: boolean;
  feedback: BulkFeedback | null;
  onApplyStatus: (status: AssetStatus) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDismissFeedback: () => void;
}

export function BulkActionBar({
  selectedCount,
  totalLoaded,
  isProcessing,
  feedback,
  onApplyStatus,
  onSelectAll,
  onClearSelection,
  onDismissFeedback,
}: Props) {
  return (
    <>
      {/* Floating Bulk Action Bar */}
      {selectedCount > 0 && (
        <aside
          className="bulk-bar"
          role="region"
          aria-label="Bulk actions toolbar"
        >
          <div className="bulk-bar__info">
            <span className="bulk-bar__count">
              <strong>{selectedCount}</strong> {selectedCount === 1 ? 'asset' : 'assets'} selected
            </span>
            {selectedCount < totalLoaded && (
              <button
                type="button"
                className="btn btn--link text-xs"
                onClick={onSelectAll}
                disabled={isProcessing}
              >
                Select all {totalLoaded} loaded
              </button>
            )}
          </div>

          <div className="bulk-bar__actions">
            <span className="bulk-bar__label muted text-xs">Set status:</span>
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="btn btn--bulk-status"
                disabled={isProcessing}
                onClick={() => onApplyStatus(status)}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>

          <div className="bulk-bar__trailing">
            {isProcessing && (
              <div className="bulk-bar__spinner" aria-label="Processing batch update">
                <div className="spinner-small" aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onClearSelection}
              disabled={isProcessing}
            >
              Clear
            </button>
          </div>
        </aside>
      )}

      {/* Partial / Bulk Feedback Toast */}
      {feedback && (
        <aside
          className={`feedback-toast feedback-toast--${feedback.type}`}
          role="alert"
          aria-live="assertive"
        >
          <div className="feedback-toast__header">
            <div className="feedback-toast__icon">
              {feedback.type === 'success' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
            </div>
            <div className="feedback-toast__message">
              <strong>
                {feedback.applied} updated to {statusLabel(feedback.nextStatus).toLowerCase()}
                {feedback.failed > 0 ? `, ${feedback.failed} failed` : ''}
              </strong>
              {feedback.failed > 0 && (
                <div className="feedback-toast__details text-xs">
                  {feedback.legalHoldIds.length > 0 && (
                    <p className="detail-item detail-item--hold">
                      <strong>{feedback.legalHoldIds.length}</strong> restricted by Legal Hold ({feedback.legalHoldIds.slice(0, 3).join(', ')}{feedback.legalHoldIds.length > 3 ? '...' : ''}).
                    </p>
                  )}
                  {feedback.conflictIds.length > 0 && (
                    <p className="detail-item detail-item--conflict">
                      <strong>{feedback.conflictIds.length}</strong> encountered transient write conflicts.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="feedback-toast__actions">
              {feedback.retryConflicts && (
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={feedback.retryConflicts}
                >
                  Retry Conflicts ({feedback.conflictIds.length})
                </button>
              )}
              {feedback.undoSuccesses && (
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  onClick={feedback.undoSuccesses}
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                className="btn-icon btn-icon--sm"
                onClick={onDismissFeedback}
                aria-label="Dismiss notification"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
