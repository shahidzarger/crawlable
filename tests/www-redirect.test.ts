import { describe, expect, it } from 'vitest';
import { sameSite, siteHost } from '@/lib/audit/url';

/**
 * The apex-to-www bug.
 *
 * century.ae redirects to www.century.ae. Discovery compared candidate links
 * against `URL.origin`, which folds in the www label, so every one of the
 * site's 116 homepage links and all 120 of its sitemap entries were discarded
 * as cross-origin. The audit reported a single page for a site with hundreds,
 * and nothing failed loudly enough to notice.
 */

describe('siteHost', () => {
  it('drops a leading www', () => {
    expect(siteHost('www.century.ae')).toBe('century.ae');
    expect(siteHost('century.ae')).toBe('century.ae');
  });

  it('is case-insensitive', () => {
    expect(siteHost('WWW.Century.AE')).toBe('century.ae');
  });

  it('keeps every other subdomain, including ones that merely start with www', () => {
    // wwwx is not www: treating it as the apex would let the crawler wander.
    expect(siteHost('wwwx.century.ae')).toBe('wwwx.century.ae');
    expect(siteHost('blog.century.ae')).toBe('blog.century.ae');
    expect(siteHost('www.blog.century.ae')).toBe('blog.century.ae');
  });
});

describe('sameSite', () => {
  it('treats an apex and its www host as one site', () => {
    expect(sameSite('https://century.ae/', 'https://www.century.ae/en/')).toBe(true);
    expect(sameSite('https://www.century.ae/en/about-us/', 'https://century.ae')).toBe(true);
  });

  it('ignores the scheme, so an http link on an https site still counts', () => {
    expect(sameSite('http://www.century.ae/en/', 'https://century.ae')).toBe(true);
  });

  it('still rejects a different site', () => {
    expect(sameSite('https://example.com/', 'https://century.ae')).toBe(false);
    expect(sameSite('https://century.ae.evil.com/', 'https://century.ae')).toBe(false);
  });

  it('still rejects a different subdomain', () => {
    expect(sameSite('https://blog.century.ae/', 'https://century.ae')).toBe(false);
  });

  it('is false rather than throwing on a malformed input', () => {
    expect(sameSite('not a url', 'https://century.ae')).toBe(false);
  });
});
