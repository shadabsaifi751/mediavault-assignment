# Submission

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:** https://www.loom.com/share/6fb17471c995449783e7558bed2e06b6

---

## How to run it

The project runs using standard Node.js scripts:

```bash
# Node version: >=20.11
npm install

# Start both dev server (port 5173) and mock API (port 8787)
npm run dev

# Run targeted concurrency and rollback unit tests
npm run test

# Typecheck and build production bundle
npm run build
```

---

## Time spent

Total effort: ~11.5 focused hours spread over 3 days:

- **1.5h — Architecture & Defect Audit:** Auditing baseline codebase, mapping the hostile API contract, and planning resilient failure handling.
- **2.0h — API Hardening & Network Pipeline:** Typed `ApiError`, exponential backoff with full jitter, `Retry-After` parsing, AbortSignal cancellation, and request deduplication.
- **2.5h — Virtualization & Scale:** Headless 2D grid virtualization using `@tanstack/react-virtual`, dynamic column recalculation, cursor infinite scrolling, and lazy image fallbacks.
- **2.0h — Bulk Actions & Optimistic Rollback:** Chunking requests with bounded concurrency ($\le 50$ items, concurrency limit = 2), optimistic updates, and selective rollback on `207 Multi-Status`.
- **1.5h — Accessibility & Keyboard Navigation:** Roving tabindex, 2D arrow navigation, focus management (trap into panel, return to card on close), Escape shortcuts, and ARIA live regions.
- **1.0h — UI Craft & System States:** WCAG AA design system, progression status badges with icons, designed skeletons, empty states, and offline banner.
- **1.0h — Verification, Benchmarks & Unit Tests:** Writing concurrency tests and recording performance benchmarks.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
|---|---|---|---|
| 1 | Unbounded bulk update sends $>50$ IDs in one call, causing `400 too_many_ids` | `App.tsx:applyBulkStatus` | **Fixed:** Chunked into batches of $\le 50$ with bounded concurrency. |
| 2 | Keystrokes fire immediate un-debounced requests, racing and tripping 429 rate limit | `App.tsx` & `useAssets.ts` | **Fixed:** 300ms debounce with immediate input responsiveness. |
| 3 | No `AbortController` cancellation on in-flight requests; short prefix responses overwrite newer ones | `useAssets.ts` | **Fixed:** TanStack Query cancels stale requests via `signal`. |
| 4 | No request deduplication; concurrent identical queries fire twice | `src/api/client.ts` | **Fixed:** In-flight GET promise memoization and TanStack Query deduplication. |
| 5 | Filter/sort changes while paginated reuse cursor, triggering `400 stale_cursor` | `useAssets.ts` | **Fixed:** Infinite query key includes normalized filters; resets cursor automatically. |
| 6 | No grid virtualization; rendering thousands of DOM nodes causes memory bloat and scroll jank | `AssetGrid.tsx` | **Fixed:** Bounded DOM nodes using `@tanstack/react-virtual`. |
| 7 | Toggling selection on one card re-renders every card in the grid | `AssetGrid.tsx` | **Fixed:** Memoized `AssetCard` with primitive `isSelected` boolean prop. |
| 8 | Detail panel opening/closing loses focus to `document.body` without focus restoration | `AssetDetail.tsx` | **Fixed:** Storing prior focused element and restoring focus on panel close. |
| 9 | Grid is unreachable via keyboard; lacks roving tabindex and arrow navigation | `AssetGrid.tsx` | **Fixed:** Roving `tabIndex={0}`, 2D Arrow navigation, Space to toggle, Shift+Arrows. |
| 10 | `207 Multi-Status` ignored: all responses assumed successful, ignoring `legal-hold` and conflicts | `App.tsx:applyBulkStatus` | **Fixed:** Selective rollback of failed IDs, retaining confirmed successes. |
| 11 | Detail panel `PATCH` crashes on `409 version_conflict` without recovery path | `AssetDetail.tsx` | **Fixed:** Catches 409, fetches latest version, alerts user, and avoids clobbering. |
| 12 | Missing thumbnails (`hasThumbnail: false` or 404) show broken icons with layout shift | `AssetGrid.tsx` | **Fixed:** Zero-layout-shift SVG placeholder fallback and error boundary. |
| 13 | Transient failures (`503`, `429`, `500`) are not retried with backoff or `Retry-After` | `client.ts` | **Fixed:** Structural retry policy with exponential backoff and jitter. |
| 14 | Query state (`q`, `status`, `kind`, `sort`) lost on page reload | `App.tsx` | **Fixed:** Synced with URL search params via `history.replaceState`. |
| 15 | Empty state rendered during loading or error due to naive `assets.length === 0` check | `AssetGrid.tsx` | **Fixed:** Explicit separation between skeleton loading, error card, and empty results. |

---

## Key decisions

### Data fetching and caching
Adopted `@tanstack/react-query`. Rather than maintaining ad-hoc state machines, TanStack Query provides rock-solid query deduplication, background garbage collection, declarative cache invalidation, and `AbortSignal` propagation. It powers infinite scrolling with cursor pagination seamlessly.

### Stale response handling
Solved through two coordinated layers:
1. **Request Cancellation:** Each new query passes an `AbortSignal` into `fetch`. Stale in-flight network requests are terminated immediately at the browser level rather than landing and overwriting the cache.
2. **Debouncing (300ms):** Typing is debounced by 300ms. This matches standard human typing cadence, preventing request spam into the 80 req/10s rate limit window while feeling instant to the user.

### Virtualization approach
Implemented headless row virtualization using `@tanstack/react-virtual`. Multi-column responsiveness is achieved by measuring the container width with a `ResizeObserver`, calculating the visible column count, and virtualizing the resulting rows. DOM nodes remain bounded between 180 and 240 elements regardless of whether 100 or 12,400 assets are loaded.

### Optimistic updates and rollback
When a bulk status change is submitted:
1. The query cache is immediately patched with the target status so the UI responds in 0ms.
2. Requests are chunked into batches of $\le 50$ with bounded concurrency (2 concurrent batches).
3. On `207 Multi-Status`, the client inspects individual item results:
   - Successful updates are confirmed with fresh server state.
   - Failed items (e.g. assets with `legal-hold` or transient `conflict`) are selectively reverted to their previous state.
   - A structured feedback toast displays the exact failure breakdown, providing an immediate "Retry Conflicts" button for retryable conflicts and explaining why legal-hold assets could not be modified.

### Retry and backoff policy
Implemented a typed `ApiError` hierarchy. The retry engine distinguishes:
- **Retryable:** `503 upstream_unavailable`, `429 rate_limited`, `500 write_failed`, and network `TypeError`s.
- **Non-retryable:** `400 bad_request`, `400 stale_cursor`, `409 version_conflict`, `422 invalid_status`, and `422 legal_hold`.
Retries execute with full exponential jitter ($[0, \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}})]$) and strictly honor the `Retry-After` header when provided by the server.

### State placement and URL sync
Filter state (`q`, `status`, `kind`, `sort`) is centralized in `useAssetQueryState`. It bidirectionally syncs with the browser URL using `window.history.replaceState`. This ensures links are shareable and survive page reloads without polluting the browser history stack on every keystroke.

---

## Performance

*Measured on Apple Silicon M-series (macOS, Chrome 128 / Safari 18).*

| Metric | Before | After | How measured |
|---|---|---|---|
| Rendered DOM nodes at 5,000 rows loaded | 55,000+ nodes | ~210 nodes | `document.querySelectorAll('*').length` in Chrome DevTools Elements panel. |
| Cards re-rendered when toggling one selection | 24+ cards (all visible) | Exactly 1 card | React DevTools Profiler ("Highlight updates when components render"). |
| Longest task during sustained scroll | ~140ms (jank/GC pause) | < 16ms (consistent 60fps) | Chrome DevTools Performance recording during continuous wheel scroll. |
| Requests fired while typing a 6-character query | 6 requests | Exactly 1 request | Network tab request count while typing `"assets"`. |
| Production bundle, gzipped | 48.2 kB | 75.9 kB | `vite build` computed gzip chunk size. |

**Bottleneck Analysis:**
The primary bottleneck in the baseline was un-virtualized DOM allocation combined with component over-rendering. In the baseline, changing selection modified a `Set<string>` passed down to `AssetGrid`, causing every card to re-evaluate. By introducing `@tanstack/react-virtual` to bound DOM nodes and wrapping `AssetCard` in `React.memo` with a primitive `isSelected: boolean` prop, card selection toggling dropped from an $O(N)$ DOM repaint to an $O(1)$ single-element update.

---

## Accessibility

- **Keyboard Model:** The asset grid implements a roving tabindex. Only the active card holds `tabIndex={0}`, while all other cards hold `tabIndex={-1}`. Users navigate across the 2D grid using `ArrowUp`, `ArrowDown`, `ArrowLeft`, and `ArrowRight`. Pressing `Space` toggles selection; `Shift + Arrow` extends the selection range; `Enter` opens the detail panel; `Escape` closes the panel or clears selection.
- **Focus Management:** When `AssetDetail` opens, focus automatically moves to the close button inside the panel. When the user closes the panel (via button or `Escape`), focus is returned directly to the card that opened it.
- **Screen Reader Announcements:** An ARIA live region (`aria-live="polite"`) announces search result counts, filter adjustments, and bulk operation outcomes without spamming intermediate keystrokes.
- **Semantics:** Cards use `role="gridcell"` inside `role="row"` and `role="grid"`, with `aria-selected` tracking selection state. Checkbox inputs have descriptive `aria-label` attributes.
- **Testing:** Tested using full keyboard navigation and macOS VoiceOver.

---

## Interface decisions

Optimized for high-density, day-long productivity by media producers and reviewers who need instant visual feedback, reliable bulk workflows, and zero UI stutter.

- **Visual System:** Built on clean CSS custom properties defining a structured grayscale canvas, high-contrast text (`#0f172a`), 4px-based spacing scale, and subtle elevation shadows.
- **Status Treatment:** Status is conveyed through a 4-stage progression (Draft $\to$ In Review $\to$ Approved $\to$ Archived). To support color-blind users and comply with WCAG, **color is never the sole indicator**: each status pill pairs distinct hues with unique semantic iconography (Pencil for Draft, Clock for In Review, Checkmark for Approved, Archive box for Archived).
- **States:** Designed purpose-built UI states:
  - *Loading:* Animated shimmer skeleton grid reserving exact aspect ratio.
  - *Empty:* Centered illustration state with a one-click "Reset all filters" button.
  - *Error:* Clear alert card detailing the issue with a direct "Retry Query" action.
  - *Offline:* High-visibility top banner warning the user that network requests are paused.
  - *Partial Failure:* Non-blocking floating toast displaying exact legal-hold vs conflict breakdowns, with a one-click "Retry Conflicts" button.
- **Contrast:** Checked against WCAG AA standards using Chrome DevTools contrast audit; all body text, badges, and controls exceed the 4.5:1 ratio (primary text reaches 12.8:1).
- **Copy:** Rewrote technical backend strings into actionable human copy (e.g. replaced `429: Too many requests in the last 10 seconds.` with `"High server traffic. Pausing briefly before trying again."`).

---

## Trade-offs and cuts

- **Offline Queueing:** Detected offline transitions and alerted the user, but intentionally cut persistent offline mutation queuing. Given the hostile backend's strict version checks (`409`), replay queuing without live resolution could lead to extensive conflict storms once reconnected.
- **Full Mobile Optimization:** The layout gracefully adapts down to narrow viewports (e.g. tablet width and single-column grid) without overlapping, but comprehensive mobile touch gestures (swipe to select, bottom sheets) were cut to prioritize desktop reviewer workflows.

---

## Critique of the API

1. **Inconsistent Versioning Models:** `PATCH /api/assets/:id` enforces optimistic locking via `version`, but `POST /api/assets/bulk-status` completely ignores versioning and returns random conflicts. A unified versioning or idempotency-key header across all mutation endpoints would make concurrency guarantees predictable.
2. **Asymmetric Batch Caps:** Batch retrieval is capped at 25 IDs while bulk status allows 50 IDs. Aligning these limits would simplify client-side chunking logic.
3. **Brittle Cursor Fingerprints:** The base64 cursor binds to exact query string parameters, including parameter order and empty string representations. If a client adds an empty filter or formats whitespace slightly differently, the server returns `400 stale_cursor`. A stateless or keyset pagination model (e.g. `updatedAt_id`) would be substantially more resilient.

---

## Anything you would like us to look at

- **`useBulkOperations.ts` & `src/api/client.ts`:** The bounded-concurrency chunking engine combined with selective rollback on `207 Multi-Status` (`test/concurrency-rollback.test.mjs`).
- **`AssetGrid.tsx` & `AssetCard.tsx`:** The 2D virtualization integration with roving tabindex keyboard navigation and $O(1)$ single-card selection re-renders.
- **`useAssetEvents.ts`:** Real-time Server-Sent Events reconciling live backend updates directly into the client query cache without resetting scroll position.
