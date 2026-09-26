import { describe, expect, it } from 'vitest';
import {
  GENERATED_FILE_NAMES,
  generateAll,
  generateFixesMarkdown,
  isCompleteFixKit,
} from '@/lib/audit/generators';
import { createZip } from '@/lib/audit/zip';
import type { AuditResult, GeneratedFiles } from '@/lib/audit/types';

/**
 * The Fix Kit is the paid deliverable and the pricing page names all five
 * files. These tests exist because the archive shipped four: a record saved
 * before the sitemap generator existed carried a four-key `generated` object,
 * the download route trusted it because it was merely non-null, and the fifth
 * entry came back undefined.
 */

function result(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    id: 'test-audit',
    siteUrl: 'https://example.com',
    mode: 'audit',
    createdAt: new Date('2026-09-26T00:00:00Z').toISOString(),
    durationMs: 1000,
    score: 62,
    grade: 'C',
    invisiblePercent: 20,
    pagesAudited: 2,
    pagesFailed: 0,
    pagesSkipped: 0,
    isPartialScan: false,
    checks: [],
    pages: [
      { url: 'https://example.com/', status: 200, title: 'Home' },
      { url: 'https://example.com/pricing', status: 200, title: 'Pricing' },
    ],
    robots: { found: true, url: '', status: 200, raw: null, groups: [], sitemaps: [], crawlerAccess: [], error: null },
    llmsTxt: { found: false, url: '', status: 404, raw: null, error: null },
    ...overrides,
  } as unknown as AuditResult;
}

describe('Fix Kit completeness', () => {
  it('generates all five files, every time', () => {
    const files = generateAll(result());
    for (const name of GENERATED_FILE_NAMES) {
      expect(typeof files[name], name).toBe('string');
      expect(files[name].length, name).toBeGreaterThan(0);
    }
    expect(Object.keys(files)).toHaveLength(5);
  });

  it('includes sitemap.xml even when the site already has one', () => {
    // The thing most likely to be "optimised away" by a well-meaning guard.
    // There is no such guard, and this test is what keeps it that way.
    const withSitemap = generateAll(
      result({
        robots: {
          found: true,
          url: 'https://example.com/robots.txt',
          status: 200,
          raw: 'Sitemap: https://example.com/sitemap.xml',
          groups: [],
          sitemaps: ['https://example.com/sitemap.xml'],
          crawlerAccess: [],
          error: null,
        },
      } as unknown as Partial<AuditResult>),
    );
    expect(withSitemap['sitemap.xml']).toContain('<urlset');
  });

  it('tells the customer why a second sitemap is not a duplicate', () => {
    const fixes = generateFixesMarkdown(
      result({
        robots: {
          found: true,
          url: '',
          status: 200,
          raw: null,
          groups: [],
          sitemaps: ['https://example.com/sitemap_index.xml'],
          crawlerAccess: [],
          error: null,
        },
      } as unknown as Partial<AuditResult>),
    );
    expect(fixes).toContain('You already have a sitemap');
    expect(fixes).toContain('sitemap_index.xml');
    expect(fixes).toMatch(/canonical alternative/);
  });

  it('says nothing about an existing sitemap when there is none', () => {
    expect(generateFixesMarkdown(result())).not.toContain('You already have a sitemap');
  });
});

describe('isCompleteFixKit', () => {
  const full = Object.fromEntries(
    GENERATED_FILE_NAMES.map((name) => [name, 'content']),
  ) as unknown as GeneratedFiles;

  it('accepts a complete kit', () => {
    expect(isCompleteFixKit(full)).toBe(true);
  });

  it('rejects a record saved before sitemap.xml existed', () => {
    // The exact shape that shipped a four-file archive.
    const { 'sitemap.xml': _omitted, ...stale } = full;
    expect(isCompleteFixKit(stale)).toBe(false);
  });

  it('rejects undefined and an empty file', () => {
    expect(isCompleteFixKit(undefined)).toBe(false);
    expect(isCompleteFixKit({ ...full, 'sitemap.xml': '' })).toBe(false);
  });
});

describe('createZip', () => {
  it('names the file it cannot archive instead of throwing opaquely', () => {
    expect(() =>
      createZip([
        { name: 'robots.txt', content: 'ok' },
        { name: 'sitemap.xml', content: undefined as unknown as string },
      ]),
    ).toThrow(/sitemap\.xml/);
  });

  it('archives a complete five-file kit', () => {
    const files = generateAll(result());
    const zip = createZip(
      GENERATED_FILE_NAMES.map((name) => ({ name, content: files[name] })),
    );
    // Each entry appears twice in a ZIP: local header and central directory.
    for (const name of GENERATED_FILE_NAMES) {
      const occurrences = zip.toString('latin1').split(name).length - 1;
      expect(occurrences, name).toBeGreaterThanOrEqual(2);
    }
  });
});
