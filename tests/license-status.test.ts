import { describe, expect, it } from 'vitest';
import { isLicenseExpired, isUsableLicenseStatus } from '@/lib/lemonsqueezy';
import { recordLicense, remainingCredits, spendCredit } from '@/lib/licensing';
import { hashLicenseKey } from '@/lib/lemonsqueezy';
import { store } from '@/lib/db';

/**
 * Regression cover for the bug that made a freshly purchased key unusable.
 *
 * Lemon Squeezy reports a key as `inactive` from issue until an instance is
 * activated against it. Crawlable authenticates by key and never activates an
 * instance, so `inactive` is the steady state for every paying customer — not
 * a transient one. Treating it as dead rejected everybody.
 */

describe('isUsableLicenseStatus', () => {
  it('accepts a freshly issued key, which reports as inactive', () => {
    expect(isUsableLicenseStatus('inactive')).toBe(true);
  });

  it('accepts an active key', () => {
    expect(isUsableLicenseStatus('active')).toBe(true);
  });

  it('blocks only the statuses that actually mean finished', () => {
    expect(isUsableLicenseStatus('expired')).toBe(false);
    expect(isUsableLicenseStatus('disabled')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isUsableLicenseStatus('EXPIRED')).toBe(false);
    expect(isUsableLicenseStatus('Inactive')).toBe(true);
  });

  it('accepts a missing status rather than refusing a key the API called valid', () => {
    expect(isUsableLicenseStatus(null)).toBe(true);
    expect(isUsableLicenseStatus(undefined)).toBe(true);
    expect(isUsableLicenseStatus('')).toBe(true);
  });

  it('accepts an unrecognised status, so a new one upstream cannot lock customers out', () => {
    expect(isUsableLicenseStatus('some-future-status')).toBe(true);
  });
});

describe('isLicenseExpired', () => {
  const now = new Date('2026-09-22T12:00:00Z');

  it('treats null as a lifetime licence — the one-time pack case', () => {
    // new Date(null) is the epoch, which is always in the past. Reaching the
    // comparison at all is the bug; this asserts we never do.
    expect(isLicenseExpired(null, now)).toBe(false);
  });

  it('treats undefined and empty string as lifetime too', () => {
    expect(isLicenseExpired(undefined, now)).toBe(false);
    expect(isLicenseExpired('', now)).toBe(false);
  });

  it('expires a date in the past', () => {
    expect(isLicenseExpired('2026-09-21T12:00:00Z', now)).toBe(true);
  });

  it('does not expire a date in the future', () => {
    expect(isLicenseExpired('2026-10-22T12:00:00Z', now)).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isLicenseExpired('2026-09-22T12:00:00Z', now)).toBe(true);
  });

  it('treats an unparseable date as non-expiring rather than locking a customer out', () => {
    expect(isLicenseExpired('not-a-date', now)).toBe(false);
    expect(isLicenseExpired('0000-00-00', now)).toBe(false);
  });
});

describe('the exact combination that was broken', () => {
  it('a new one-time pack key is usable: inactive status, null expiry', () => {
    const status = 'inactive';
    const expiresAt = null;

    const dead = !isUsableLicenseStatus(status) || isLicenseExpired(expiresAt);

    expect(dead, 'a just-purchased 5-credit pack must not be marked expired').toBe(false);
  });

  it('a genuinely finished subscription key is still refused', () => {
    const dead =
      !isUsableLicenseStatus('expired') || isLicenseExpired('2020-01-01T00:00:00Z');
    expect(dead).toBe(true);
  });
});

describe('credits decrement cleanly on a freshly provisioned pack', () => {
  it('spends exactly five, then refuses the sixth — with no expiry block', async () => {
    const key = `TEST-PACK-${Date.now()}`;
    const keyHash = hashLicenseKey(key);

    // Provisioned the way an unwebhooked purchase arrives: usable status, no expiry.
    const license = await recordLicense({
      licenseKey: key,
      plan: 'pack',
      email: 'buyer@example.invalid',
      orderId: 'test-order-1',
      status: 'active',
    });

    expect(license.auditQuota, 'quota comes from lib/plans, not the payload').toBe(5);
    expect(remainingCredits(license)).toBe(5);

    const outcomes = [];
    for (let i = 0; i < 5; i += 1) {
      outcomes.push(await spendCredit(keyHash));
    }

    expect(outcomes.every((o) => o.allowed), 'all five must be allowed').toBe(true);
    expect(outcomes.map((o) => o.remaining)).toEqual([4, 3, 2, 1, 0]);

    const sixth = await spendCredit(keyHash);
    expect(sixth.allowed).toBe(false);
    expect(sixth.reason).toMatch(/credits on this license are used/);
    // The refusal must be about credits, never about expiry.
    expect(sixth.reason).not.toMatch(/expired/i);

    const db = await store();
    const finalRecord = await db.getLicense(keyHash);
    expect(finalRecord?.auditsUsed).toBe(5);
    expect(finalRecord?.status).toBe('active');
  });

  it('two concurrent spends on the last credit cannot both succeed', async () => {
    const key = `TEST-SINGLE-${Date.now()}`;
    const keyHash = hashLicenseKey(key);

    await recordLicense({
      licenseKey: key,
      plan: 'single',
      email: 'buyer@example.invalid',
      orderId: 'test-order-2',
      status: 'active',
    });

    const [a, b] = await Promise.all([spendCredit(keyHash), spendCredit(keyHash)]);
    expect([a.allowed, b.allowed].filter(Boolean).length).toBe(1);
  });
});
