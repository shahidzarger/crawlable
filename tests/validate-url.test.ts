import { describe, expect, it } from 'vitest';
import { validateUrl, validateUrlSyntax } from '@/lib/scanner/validate-url';

/**
 * These tests exist to demonstrate a specific claim: that a string/regex
 * hostname blocklist would let every payload below through, and that resolving
 * DNS catches them. Each case is annotated with what a naive matcher would do.
 */

describe('validateUrlSyntax', () => {
  it('accepts a bare domain and adds https', () => {
    const result = validateUrlSyntax('example.com/path');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.toString()).toBe('https://example.com/path');
  });

  it('rejects non-http protocols', () => {
    for (const input of [
      'file:///etc/passwd',
      'gopher://example.com/',
      'ftp://example.com/',
      'data:text/html,<h1>x</h1>',
      'javascript:alert(1)',
    ]) {
      const result = validateUrlSyntax(input);
      expect(result.ok, `${input} should be rejected`).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid-url');
    }
  });

  it('rejects empty, whitespace and oversized input', () => {
    expect(validateUrlSyntax('').ok).toBe(false);
    expect(validateUrlSyntax('   ').ok).toBe(false);
    expect(validateUrlSyntax(`https://example.com/${'a'.repeat(3000)}`).ok).toBe(false);
  });

  it('strips the fragment so two URLs key the same audit', () => {
    const result = validateUrlSyntax('https://example.com/a#section');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.toString()).toBe('https://example.com/a');
  });
});

describe('validateUrl — SSRF payloads a string blocklist would miss', () => {
  const cases: Array<[label: string, input: string]> = [
    ['plain loopback', 'http://127.0.0.1:3000/'],
    ['loopback shorthand — "127.1" is not the string "127.0.0.1"', 'http://127.1/'],
    ['decimal-encoded loopback — contains no dots at all', 'http://2130706433/'],
    ['IPv6 loopback', 'http://[::1]:8080/'],
    [
      'IPv4-mapped IPv6 loopback — matches no IPv4 regex',
      'http://[::ffff:127.0.0.1]/',
    ],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    [
      'metadata over IPv4-mapped IPv6 — the payload that bypasses most filters',
      'http://[::ffff:169.254.169.254]/',
    ],
    ['all-zeros route', 'http://0.0.0.0/'],
    ['RFC1918 10/8', 'http://10.0.0.1/'],
    ['RFC1918 172.16/12', 'http://172.16.0.1/'],
    ['RFC1918 172.31 — upper edge of the range', 'http://172.31.255.254/'],
    ['RFC1918 192.168/16', 'http://192.168.1.1/'],
    ['CGNAT 100.64/10', 'http://100.64.0.1/'],
    ['link-local IPv6', 'http://[fe80::1]/'],
    ['unique-local IPv6', 'http://[fd00::1]/'],
  ];

  for (const [label, input] of cases) {
    it(`blocks ${label}`, async () => {
      const result = await validateUrl(input);
      expect(result.ok, `${input} was allowed through`).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('blocked-host');
        expect(result.status).toBe(400);
      }
    });
  }

  it('blocks localhost and internal suffixes by name', async () => {
    for (const input of [
      'http://localhost:3000/',
      'http://app.localhost/',
      'http://metadata.google.internal/',
    ]) {
      const result = await validateUrl(input);
      expect(result.ok, `${input} was allowed through`).toBe(false);
    }
  });

  it('blocks the hex form URL normalisation produces for IPv4-mapped addresses', async () => {
    // new URL() rewrites ::ffff:169.254.169.254 as ::ffff:a9fe:a9fe before any
    // check sees it. A matcher that only knows the dotted spelling passes this
    // straight through to the cloud metadata endpoint.
    for (const input of [
      'http://[::ffff:7f00:1]/', // 127.0.0.1
      'http://[::ffff:a9fe:a9fe]/', // 169.254.169.254
      'http://[::ffff:0a00:1]/', // 10.0.0.1
      'http://[::ffff:c0a8:101]/', // 192.168.1.1
    ]) {
      const result = await validateUrl(input);
      expect(result.ok, `${input} was allowed through`).toBe(false);
      if (!result.ok) expect(result.code).toBe('blocked-host');
    }
  });

  it('still allows a genuinely public IPv6 literal', async () => {
    // Guards against over-blocking: the ::/96 rule must not swallow real addresses.
    const result = await validateUrl('http://[2606:4700:4700::1111]/');
    expect(result.ok).toBe(true);
  });

  it('172.32 is public and must NOT be blocked — the /12 boundary', () => {
    // A regex like /^172\./ would wrongly block this. RFC1918 is 172.16–172.31.
    const result = validateUrlSyntax('http://172.32.0.1/');
    expect(result.ok).toBe(true);
  });

  it('reports an unresolvable domain as dns-failure, not blocked-host', async () => {
    const result = await validateUrl('https://nx-crawlable-test-does-not-exist.invalid');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('dns-failure');
      expect(result.status).toBe(502);
    }
  });

  it('never leaks internal detail in the message', async () => {
    const result = await validateUrl('http://169.254.169.254/');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/169\.254|ECONN|stack|node:/i);
    }
  });
});
