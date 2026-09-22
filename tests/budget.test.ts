import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '@/lib/audit/discover';

/**
 * The wall-clock budget exists to stop Vercel killing the function mid-audit,
 * which would return a bare 504 and leave the customer's credit spent with no
 * report. These tests pin the two properties that make that safe: work already
 * started is never abandoned, and work never started is visible as a skip.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency — budget behaviour', () => {
  it('processes everything when no deadline is set', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('leaves holes for work it never started, rather than fabricating results', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let started = 0;

    const results = await mapWithConcurrency(
      items,
      2,
      async (n) => {
        started += 1;
        await sleep(20);
        return n;
      },
      { deadline: Date.now() + 70 },
    );

    const done = results.filter((r) => r !== undefined);

    expect(started, 'should stop well short of all 20').toBeLessThan(20);
    expect(done.length).toBe(started);
    expect(results.length, 'array keeps its full length so skips are countable').toBe(20);
    expect(items.length - done.length).toBeGreaterThan(0);
  });

  it('never abandons a request that is already in flight', async () => {
    // A deadline that passes mid-flight must not discard the work already paid
    // for — aborting would waste the time spent and return less data.
    let completed = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3, 4],
      4,
      async (n) => {
        await sleep(60);
        completed += 1;
        return n;
      },
      { deadline: Date.now() + 10 },
    );

    // All four workers claimed an index before the deadline elapsed.
    expect(completed).toBe(4);
    expect(results.filter((r) => r !== undefined)).toEqual([1, 2, 3, 4]);
  });

  it('an already-elapsed deadline starts nothing at all', async () => {
    let started = 0;
    const results = await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (n) => {
        started += 1;
        return n;
      },
      { deadline: Date.now() - 1 },
    );

    expect(started).toBe(0);
    expect(results.every((r) => r === undefined)).toBe(true);
    expect(results.length).toBe(3);
  });

  it('processes in claim order, so the entry URL at index 0 is never the one dropped', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      1,
      async (n) => {
        seen.push(n);
        await sleep(15);
        return n;
      },
      { deadline: Date.now() + 50 },
    );

    expect(seen[0]).toBe(0);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});
