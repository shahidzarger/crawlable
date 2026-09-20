import { describe, expect, it } from 'vitest';
import { FetchError, isBlockedAddress, normaliseUrl, toOrigin } from '@/lib/audit/fetcher';
import { hashLicenseKey, licenseTail, verifyWebhookSignature } from '@/lib/lemonsqueezy';
import { createHmac } from 'node:crypto';

/**
 * These cover the two places where hostile input reaches the system: a URL a
 * stranger typed into the public scan form, and a webhook body from the open
 * internet claiming to be a purchase.
 */

describe('normaliseUrl', () => {
  it('adds https to a bare domain', () => {
    expect(normaliseUrl('example.com').toString()).toBe('https://example.com/');
  });

  it('keeps an explicit scheme and path', () => {
    expect(normaliseUrl('http://example.com/docs').toString()).toBe(
      'http://example.com/docs',
    );
  });

  it('strips the fragment', () => {
    expect(normaliseUrl('example.com/page#section').toString()).toBe(
      'https://example.com/page',
    );
  });

  it('rejects non-http schemes', () => {
    expect(() => normaliseUrl('file:///etc/passwd')).toThrow(FetchError);
    expect(() => normaliseUrl('javascript:alert(1)')).toThrow(FetchError);
    expect(() => normaliseUrl('ftp://example.com')).toThrow(FetchError);
  });

  it('rejects hostnames with no dot', () => {
    expect(() => normaliseUrl('localhost')).toThrow(FetchError);
    expect(() => normaliseUrl('http://metadata')).toThrow(FetchError);
  });

  it('rejects empty and oversized input', () => {
    expect(() => normaliseUrl('   ')).toThrow(FetchError);
    expect(() => normaliseUrl(`https://a.com/${'x'.repeat(3000)}`)).toThrow(FetchError);
  });
});

describe('toOrigin', () => {
  it('reduces a deep URL to its origin', () => {
    expect(toOrigin('https://example.com/a/b?c=d')).toBe('https://example.com');
  });
});

describe('isBlockedAddress', () => {
  it('blocks the private IPv4 ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '93.184.216.34']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('blocks private IPv6 and IPv4-mapped loopback', () => {
    for (const ip of ['::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('blocks anything that is not an IP address', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'test-signing-secret';
  const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: {} });
  const valid = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(body, valid, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(`${body} `, valid, secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const wrong = createHmac('sha256', 'other', ).update(body, 'utf8').digest('hex');
    expect(verifyWebhookSignature(body, wrong, secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, '', secret)).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    expect(verifyWebhookSignature(body, 'not-hex-at-all!!', secret)).toBe(false);
    expect(verifyWebhookSignature(body, 'abcd', secret)).toBe(false);
  });
});

describe('license key handling', () => {
  it('hashes deterministically and never returns the key', () => {
    const key = 'AAAA-BBBB-CCCC-DDDD';
    const hash = hashLicenseKey(key);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashLicenseKey(` ${key} `));
    expect(hash).not.toContain('AAAA');
  });

  it('produces different hashes for different keys', () => {
    expect(hashLicenseKey('key-one')).not.toBe(hashLicenseKey('key-two'));
  });

  it('exposes only the last four characters', () => {
    expect(licenseTail('AAAA-BBBB-CCCC-de3f')).toBe('DE3F');
  });
});

describe('runAudit host guard', () => {
  it('refuses a private address before doing any work', async () => {
    const { runAudit } = await import('@/lib/audit');

    await expect(
      runAudit({ url: 'http://169.254.169.254/latest/meta-data/', mode: 'scan' }),
    ).rejects.toThrow(FetchError);

    await expect(runAudit({ url: 'http://127.0.0.1:3000', mode: 'scan' })).rejects.toThrow(
      /private range/i,
    );
  });

  it('refuses an unresolvable host rather than returning an empty report', async () => {
    const { runAudit } = await import('@/lib/audit');

    await expect(
      runAudit({ url: 'https://this-domain-does-not-exist-crawlable-test.invalid', mode: 'scan' }),
    ).rejects.toThrow(FetchError);
  });
});
