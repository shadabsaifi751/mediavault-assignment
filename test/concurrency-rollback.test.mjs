import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, isRetryableError } from '../src/api/errors.ts';

test('Error Taxonomy - Structural Classification', () => {
  // 503 is retryable
  const e503 = new ApiError(503, 'upstream_unavailable', 'Search index warming up', 2);
  assert.equal(e503.isRetryable, true);
  assert.equal(isRetryableError(e503), true);
  assert.equal(e503.retryAfterSec, 2);

  // 429 is retryable
  const e429 = new ApiError(429, 'rate_limited', 'Too many requests', 3);
  assert.equal(e429.isRetryable, true);
  assert.equal(isRetryableError(e429), true);
  assert.equal(e429.retryAfterSec, 3);

  // 500 write_failed is retryable
  const e500 = new ApiError(500, 'write_failed', 'Write failed');
  assert.equal(e500.isRetryable, true);
  assert.equal(isRetryableError(e500), true);

  // 400 stale_cursor is NOT retryable
  const e400 = new ApiError(400, 'stale_cursor', 'Stale cursor');
  assert.equal(e400.isRetryable, false);
  assert.equal(isRetryableError(e400), false);

  // 409 version_conflict is NOT retryable (must refetch)
  const e409 = new ApiError(409, 'version_conflict', 'Asset changed');
  assert.equal(e409.isRetryable, false);
  assert.equal(isRetryableError(e409), false);

  // 422 legal_hold is NOT retryable
  const e422 = new ApiError(422, 'legal_hold', 'Legal hold');
  assert.equal(e422.isRetryable, false);
  assert.equal(isRetryableError(e422), false);
});

test('207 Multi-Status Selective Rollback Logic', () => {
  // Setup initial assets state
  const assets = [
    { id: 'a_00001', status: 'draft', tags: [] },
    { id: 'a_00002', status: 'draft', tags: ['legal-hold'] },
    { id: 'a_00003', status: 'draft', tags: [] },
  ];

  const snapshot = new Map(assets.map((a) => [a.id, a.status]));
  const targetStatus = 'approved';

  // 1. Optimistic update
  const state = assets.map((a) => ({ ...a, status: targetStatus }));
  assert.equal(state.every((a) => a.status === 'approved'), true);

  // 2. Mock 207 response where a_00002 fails (legal_hold) and a_00001/a_00003 succeed
  const mock207Response = {
    applied: 2,
    failed: 1,
    results: [
      { id: 'a_00001', ok: true },
      { id: 'a_00002', ok: false, code: 'legal_hold', message: 'Asset on legal hold' },
      { id: 'a_00003', ok: true },
    ],
  };

  // 3. Selective rollback
  const reconciled = state.map((item) => {
    const res = mock207Response.results.find((r) => r.id === item.id);
    if (res && !res.ok) {
      // Revert to snapshot
      return { ...item, status: snapshot.get(item.id) };
    }
    return item;
  });

  // Check results: only the failed item was rolled back
  assert.equal(reconciled.find((a) => a.id === 'a_00001').status, 'approved');
  assert.equal(reconciled.find((a) => a.id === 'a_00002').status, 'draft'); // rolled back!
  assert.equal(reconciled.find((a) => a.id === 'a_00003').status, 'approved');
});

test('Bulk Request Chunking & Concurrency Caps', async () => {
  // Test 120 ids chunked into 3 batches (50 + 50 + 20)
  const ids = Array.from({ length: 120 }, (_, i) => `a_${String(i).padStart(5, '0')}`);
  const CHUNK_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 50);
  assert.equal(chunks[1].length, 50);
  assert.equal(chunks[2].length, 20);

  // Bounded concurrency pool simulator
  let activeWorkers = 0;
  let maxConcurrentSeen = 0;
  const concurrencyCap = 2;

  async function mockTask() {
    activeWorkers++;
    maxConcurrentSeen = Math.max(maxConcurrentSeen, activeWorkers);
    await new Promise((r) => setTimeout(r, 20));
    activeWorkers--;
  }

  let index = 0;
  async function worker() {
    while (index < chunks.length) {
      index++;
      await mockTask();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrencyCap, chunks.length) }, () => worker()),
  );

  assert.equal(maxConcurrentSeen <= concurrencyCap, true);
  assert.equal(index, 3);
});
