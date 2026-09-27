import { describe, expect, it } from 'vitest';
import { generateLlmsTxt } from '@/lib/audit/generators';
import type { AuditResult, PageAnalysis } from '@/lib/audit/types';

/**
 * llms.txt sectioning.
 *
 * Written after a 40-page blog produced 42 headings of one link each. Grouping
 * by top-level path segment is right for /blog/, /docs/ and /pricing/ and
 * wrong for the flat permalink structure most blogs use, where the first
 * segment IS the post slug. llms.txt exists to be a compact map; one heading
 * per page is the opposite of that.
 */

function page(path: string, title: string): PageAnalysis {
  return {
    url: `https://example.com${path}`,
    status: 200,
    title,
    metaDescription: `About ${title}`,
    headings: [],
    error: null,
  } as unknown as PageAnalysis;
}

function result(pages: PageAnalysis[]): AuditResult {
  return { siteUrl: 'https://example.com', pages } as unknown as AuditResult;
}

function sections(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
}

function links(text: string): number {
  return (text.match(/^- \[/gm) ?? []).length;
}

describe('generateLlmsTxt sectioning', () => {
  it('collapses a flat blog into a handful of sections', () => {
    const pages = [
      page('/', 'Home'),
      ...Array.from({ length: 29 }, (_, i) => page(`/post-${i + 1}/`, `Post ${i + 1}`)),
    ];
    const text = generateLlmsTxt(result(pages));

    // The regression: this produced 30 headings.
    expect(sections(text).length).toBeLessThan(6);
    expect(sections(text)).toContain('Key pages');
    expect(sections(text)).toContain('Pages');

    // Every page is still listed — collapsing sections must not drop links.
    expect(links(text)).toBe(pages.length + 1); // + the sitemap line
  });

  it('keeps a real category section even with a single page', () => {
    const text = generateLlmsTxt(
      result([page('/', 'Home'), page('/pricing/', 'Pricing'), page('/one-off/', 'One off')]),
    );
    // /pricing/ is a recognised category; /one-off/ is just a slug.
    expect(sections(text)).toContain('Pricing');
    expect(sections(text)).not.toContain('One Off');
  });

  it('keeps a derived section once it has two pages', () => {
    const text = generateLlmsTxt(
      result([
        page('/', 'Home'),
        page('/tools/one/', 'Tool one'),
        page('/tools/two/', 'Tool two'),
      ]),
    );
    expect(sections(text)).toContain('Tools');
  });

  it('orders sections stably: root first, loose last', () => {
    const text = generateLlmsTxt(
      result([
        page('/', 'Home'),
        page('/blog/a/', 'A'),
        page('/blog/b/', 'B'),
        page('/stray/', 'Stray'),
      ]),
    );
    const found = sections(text).filter((section) => section !== 'Optional');
    expect(found[0]).toBe('Key pages');
    expect(found[found.length - 1]).toBe('Pages');
  });

  it('is byte-identical across regenerations', () => {
    // The file gets committed to a customer's repo; a kit that reshuffles
    // every line on regeneration produces a diff nobody can review.
    const pages = [page('/', 'Home'), page('/b/', 'B'), page('/a/', 'A')];
    expect(generateLlmsTxt(result(pages))).toBe(generateLlmsTxt(result(pages)));
  });

  it('lists every audited page somewhere', () => {
    const pages = [
      page('/', 'Home'),
      page('/blog/a/', 'A'),
      page('/blog/b/', 'B'),
      page('/pricing/', 'Pricing'),
      page('/stray-one/', 'Stray one'),
      page('/stray-two/', 'Stray two'),
    ];
    const text = generateLlmsTxt(result(pages));
    for (const item of pages) {
      expect(text, item.url).toContain(item.url);
    }
  });
});
