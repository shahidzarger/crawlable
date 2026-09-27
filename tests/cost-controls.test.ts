import { afterEach, describe, expect, it } from 'vitest';
import { rateLimitKey } from '@/lib/api';
import { MemoryStore } from '@/lib/db/memory';
import { resetEnvCache } from '@/lib/env';

/**
 * Cost controls on the free scan.
 *
 * The free scan is the one endpoint that spends real compute per call without
 * anyone paying: up to a minute of a 1 GB function and 40 outbound fetches.
 * Per-IP limits existed, but they keyed IPv6 on the full address — and every
 * IPv6 customer is handed 2^64 of those — so one person could present as an
 * unlimited number of clients. Nothing capped the total at all.
 */

describe('rateLimitKey', () => {
  it('keeps an IPv4 address as-is', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('collapses an IPv6 address to its /64, the unit one customer is given', () => {
    const a = rateLimitKey('2001:db8:abcd:12:1111:2222:3333:4444');
    const b = rateLimitKey('2001:db8:abcd:12:ffff:eeee:dddd:cccc');
    expect(a).toBe('2001:0db8:abcd:0012::/64');
    // The attack: rotate the interface identifier, keep the prefix.
    expect(b).toBe(a);
  });

  it('expands :: compression before taking the prefix', () => {
    expect(rateLimitKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(rateLimitKey('2001:db8:0:0:9::1')).toBe('2001:0db8:0000:0000::/64');
  });

  it('still separates different /64s', () => {
    expect(rateLimitKey('2001:db8:abcd:12::1')).not.toBe(rateLimitKey('2001:db8:abcd:13::1'));
  });

  it('treats an IPv4-mapped IPv6 address as the IPv4 address it wraps', () => {
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('ignores brackets, zone ids and case', () => {
    expect(rateLimitKey('[2001:DB8:abcd:12::1]')).toBe('2001:0db8:abcd:0012::/64');
    expect(rateLimitKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  });

  it('passes through anything it cannot parse rather than throwing', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
  });
});

describe('rate limiter semantics', () => {
  it('allows exactly `limit` requests, then refuses', async () => {
    const db = new MemoryStore();
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await db.rateLimit('t', 3, 60));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('is not bypassed by a burst of parallel requests', async () => {
    const db = new MemoryStore();
    const results = await Promise.all(Array.from({ length: 20 }, () => db.rateLimit('burst', 3, 60)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

describe('global scan ceiling', () => {
  const original = process.env.SCAN_GLOBAL_HOURLY_LIMIT;
  afterEach(() => {
    if (original === undefined) delete process.env.SCAN_GLOBAL_HOURLY_LIMIT;
    else process.env.SCAN_GLOBAL_HOURLY_LIMIT = original;
    resetEnvCache();
  });

  it('has a finite default', async () => {
    delete process.env.SCAN_GLOBAL_HOURLY_LIMIT;
    resetEnvCache();
    const { scanGlobalLimit } = await import('@/lib/config');
    const { limit, windowSeconds } = scanGlobalLimit();
    expect(Number.isFinite(limit)).toBe(true);
    expect(limit).toBeGreaterThan(0);
    expect(windowSeconds).toBe(3600);
  });

  it('can be overridden from the environment', async () => {
    process.env.SCAN_GLOBAL_HOURLY_LIMIT = '42';
    resetEnvCache();
    const { scanGlobalLimit } = await import('@/lib/config');
    expect(scanGlobalLimit().limit).toBe(42);
  });

  it('trips on many distinct callers, which a per-IP limit cannot see', async () => {
    const db = new MemoryStore();
    // 50 different /64s, each well under its own per-IP allowance.
    let admitted = 0;
    for (let i = 0; i < 50; i += 1) {
      const perIp = await db.rateLimit(`scan:2001:db8:${i}::/64`, 3, 3600);
      const global = await db.rateLimit('scan:__global__', 10, 3600);
      if (perIp && global) admitted += 1;
    }
    expect(admitted).toBe(10);
  });
});
