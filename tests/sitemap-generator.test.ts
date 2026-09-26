import { describe, expect, it } from 'vitest';
import { generateSitemapXml, isoDate, sitemapEntries, escapeXml } from '@/lib/audit/sitemap';
import type { AuditResult, PageAnalysis } from '@/lib/audit/types';

/**
 * The sitemap ships to customers who submit it to Google Search Console, so
 * the bar is validity and honesty: nothing in it may be a 404, a redirect, a
 * duplicate or an off-origin URL, and the file must not overstate what it
 * covers.
 */

function page(url: string, status = 200): PageAnalysis {
  return { url, status } as unknown as PageAnalysis;
}

function result(pages: PageAnalysis[], siteUrl = 'https://example.com'): AuditResult {
  return { siteUrl, pages, pagesAudited: pages.length } as unknown as AuditResult;
}

describe('sitemapEntries', () => {
  it('includes only pages that returned 200', () => {
    const entries = sitemapEntries(
      result([
        page('https://example.com/'),
        page('https://example.com/gone', 404),
        page('https://example.com/broken', 500),
        page('https://example.com/teapot', 418),
      ]),
    );
    expect(entries.map((e) => e.loc)).toEqual(['https://example.com/']);
  });

  it('lists one page once, whatever spelling the crawl found', () => {
    const entries = sitemapEntries(
      result([
        page('https://example.com/blog'),
        page('https://example.com/blog/'),
        page('https://example.com/blog?utm_source=x'),
      ]),
    );
    expect(entries).toHaveLength(1);
  });

  it('refuses URLs from another origin', () => {
    // Search Console rejects the whole file over one cross-origin row.
    const entries = sitemapEntries(
      result([page('https://example.com/'), page('https://cdn.other.com/a')]),
    );
    expect(entries).toHaveLength(1);
  });

  it('drops the duplicate query forms that shadow a real URL', () => {
    const entries = sitemapEntries(
      result([page('https://example.com/?p=123'), page('https://example.com/hello-world')]),
    );
    expect(entries.map((e) => e.loc)).toEqual(['https://example.com/hello-world']);
  });

  it('assigns the three priority tiers', () => {
    const entries = sitemapEntries(
      result([
        page('https://example.com/'),
        page('https://example.com/pricing'),
        page('https://example.com/features'),
        page('https://example.com/terms'),
        page('https://example.com/privacy'),
      ]),
    );
    const byPath = new Map(entries.map((e) => [new URL(e.loc).pathname, e.priority]));
    expect(byPath.get('/')).toBe('1.0');
    expect(byPath.get('/pricing')).toBe('0.8');
    expect(byPath.get('/features')).toBe('0.8');
    expect(byPath.get('/terms')).toBe('0.5');
    expect(byPath.get('/privacy')).toBe('0.5');
  });

  it('puts the home page first', () => {
    const entries = sitemapEntries(
      result([page('https://example.com/terms'), page('https://example.com/')]),
    );
    expect(entries[0]?.loc).toBe('https://example.com/');
  });
});

describe('generateSitemapXml', () => {
  const xml = generateSitemapXml(
    result([
      page('https://example.com/'),
      page('https://example.com/pricing'),
      page('https://example.com/terms'),
      page('https://example.com/missing', 404),
    ]),
    new Date('2026-09-26T10:00:00Z'),
  );

  it('declares the sitemaps.org namespace', () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('emits lastmod as a W3C date', () => {
    expect(xml).toContain('<lastmod>2026-09-26</lastmod>');
    expect(isoDate(new Date('2026-01-02T23:00:00Z'))).toBe('2026-01-02');
  });

  it('is well-formed and balanced', () => {
    const opens = (xml.match(/<url>/g) ?? []).length;
    const closes = (xml.match(/<\/url>/g) ?? []).length;
    expect(opens).toBe(3);
    expect(closes).toBe(3);
    expect(xml).not.toContain('missing');
  });

  it('states its own coverage rather than implying it is complete', () => {
    // The customer is told to submit this file. If their site has 500 pages
    // and this has 40, replacing their real sitemap would shrink indexation.
    expect(xml).toMatch(/STARTING POINT/);
    expect(xml).toMatch(/3 pages the audit crawled/);
  });

  it('escapes characters that would break the document', () => {
    expect(escapeXml('https://x.com/a?b=1&c=2')).toBe('https://x.com/a?b=1&amp;c=2');
    const withAmp = generateSitemapXml(
      result([page('https://example.com/search?a=1&b=2')]),
    );
    expect(withAmp).toContain('&amp;');
    expect(withAmp).not.toMatch(/[^&]&[a-z]+=/);
  });
});
