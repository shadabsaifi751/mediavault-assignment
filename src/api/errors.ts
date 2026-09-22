export interface ApiErrorPayload {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSec?: number;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, retryAfterSec?: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
    this.requestId = requestId;
  }

  get isRetryable(): boolean {
    if (this.status === 429 || this.status === 503) {
      return true;
    }
    if (this.status === 500 && this.code === 'write_failed') {
      return true;
    }
    return false;
  }

  get userMessage(): string {
    switch (this.code) {
      case 'rate_limited':
        return `High server traffic. Pausing briefly before trying again${
          this.retryAfterSec ? ` (approx. ${this.retryAfterSec}s)` : ''
        }.`;
      case 'upstream_unavailable':
        return 'The search service is temporarily warming up. Retrying automatically...';
      case 'version_conflict':
        return 'This asset was updated by another session. Please reload to review the latest changes.';
      case 'stale_cursor':
        return 'Search filters were updated while paginating. Resetting results...';
      case 'too_many_ids':
        return 'The batch size exceeded server limits. Request will be chunked automatically.';
      case 'legal_hold':
        return 'This asset is tagged under legal hold and cannot be modified or archived.';
      default:
        if (this.status >= 500) {
          return 'Server experienced an intermittent error. Retrying...';
        }
        return this.message || 'An unexpected error occurred.';
    }
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isRetryable;
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    // Network disconnection / DNS failure
    return true;
  }
  return false;
}
