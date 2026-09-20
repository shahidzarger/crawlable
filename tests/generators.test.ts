import { describe, expect, it } from 'vitest';
import {
  generateAll,
  generateJsonLd,
  generateLlmsTxt,
  generateRobotsTxt,
} from '@/lib/audit/generators';
import { validateLlmsTxt } from '@/lib/audit/llmstxt';
import { evaluateCrawlerAccess, parseRobots } from '@/lib/audit/robots';
import { runChecks, overallScore, gradeFor, invisibleShare } from '@/lib/audit/scoring';
import { VISIBILITY_CRITICAL_CRAWLERS } from '@/lib/audit/crawlers';
import type { AuditResult, PageAnalysis } from '@/lib/audit/types';

function page(url: string, title: string, description: string): PageAnalysis {
  return {
    url,
    status: 200,
    fetchMs: 100,
    contentType: 'text/html',
    bytes: 20_000,
    rawTextLength: 3_000,
    rawWordCount: 600,
    textToHtmlRatio: 0.15,
    isSpaShell: false,
    spaSignals: [],
    framework: null,
    title,
    metaDescription: description,
    canonical: null,
    headings: [
      { level: 1, text: title },
      { level: 2, text: 'Details' },
    ],
    h1Count: 1,
    jsonLd: [],
    schemaTypes: [],
    internalLinks: 5,
    externalLinks: 1,
    imagesMissingAlt: 0,
    imageCount: 1,
    noindex: false,
    error: null,
  };
}

function buildResult(robotsRaw: string): AuditResult {
  const pages = [
    page('https://acme.test/', 'Home — Acme', 'Acme builds project tools.'),
    page('https://acme.test/docs/start', 'Getting started — Acme', 'Install and run Acme.'),
    page('https://acme.test/blog/launch', 'We launched — Acme', 'Announcing Acme 1.0.'),
    page('https://acme.test/pricing', 'Pricing — Acme', 'Flat monthly pricing.'),
  ];

  const { groups, sitemaps } = parseRobots(robotsRaw);
  const robots = {
    found: true,
    url: 'https://acme.test/robots.txt',
    status: 200,
    raw: robotsRaw,
    groups,
    sitemaps,
    crawlerAccess: evaluateCrawlerAccess(groups),
    error: null,
  };

  const llmsTxt = {
    found: false,
    url: 'https://acme.test/llms.txt',
    status: 404,
    raw: null,
    wellFormed: false,
    issues: [],
    linkCount: 0,
  };

  const checks = runChecks(pages, robots, llmsTxt);
  const score = overallScore(checks);

  return {
    id: '11111111-2222-4333-8444-555555555555',
    siteUrl: 'https://acme.test',
    mode: 'audit',
    createdAt: new Date('2026-09-19T10:00:00Z').toISOString(),
    durationMs: 4200,
    score,
    grade: gradeFor(score),
    invisiblePercent: invisibleShare(pages),
    pagesAudited: pages.length,
    pagesFailed: 0,
    checks,
    pages,
    robots,
    llmsTxt,
  };
}

describe('generateLlmsTxt', () => {
  const result = buildResult('User-agent: *\nAllow: /');
  const output = generateLlmsTxt(result);

  it('produces a file that passes its own validator', () => {
    const validation = validateLlmsTxt(output);
    expect(validation.issues).toEqual([]);
    expect(validation.wellFormed).toBe(true);
  });

  it('uses absolute URLs for every link', () => {
    const links = [...output.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link[2]).toMatch(/^https?:\/\//);
    }
  });

  it('groups pages into sections by their top-level path', () => {
    expect(output).toContain('## Documentation');
    expect(output).toContain('## Blog');
    expect(output).toContain('## Pricing');
  });

  it('derives the site name from the page titles', () => {
    expect(output.startsWith('# Acme')).toBe(true);
  });

  it('leaves no unresolved template placeholders', () => {
    expect(output).not.toMatch(/\{\{|\}\}|TODO|LOREM/i);
  });
});

describe('generateRobotsTxt', () => {
  it('allows every retrieval crawler explicitly', () => {
    const output = generateRobotsTxt(buildResult('User-agent: *\nAllow: /'));
    for (const crawler of VISIBILITY_CRITICAL_CRAWLERS) {
      expect(output).toContain(`User-agent: ${crawler.token}`);
    }
  });

  it('carries over existing wildcard disallows rather than dropping them', () => {
    const output = generateRobotsTxt(
      buildResult('User-agent: *\nDisallow: /admin\nDisallow: /cart'),
    );
    expect(output).toContain('Disallow: /admin');
    expect(output).toContain('Disallow: /cart');
  });

  it('always declares a sitemap', () => {
    const output = generateRobotsTxt(buildResult('User-agent: *\nAllow: /'));
    expect(output).toMatch(/^Sitemap: https:\/\/acme\.test\/sitemap\.xml$/m);
  });

  it('prefers the site\'s declared sitemap when there is one', () => {
    const output = generateRobotsTxt(
      buildResult('User-agent: *\nAllow: /\nSitemap: https://acme.test/custom-sitemap.xml'),
    );
    expect(output).toContain('Sitemap: https://acme.test/custom-sitemap.xml');
  });

  it('parses back into rules that allow the retrieval crawlers', () => {
    const output = generateRobotsTxt(buildResult('User-agent: *\nDisallow: /'));
    const access = evaluateCrawlerAccess(parseRobots(output).groups);

    for (const crawler of VISIBILITY_CRITICAL_CRAWLERS) {
      const entry = access.find((item) => item.crawler.token === crawler.token);
      expect(entry?.allowed, crawler.token).toBe(true);
    }
  });
});

describe('generateJsonLd', () => {
  const output = generateJsonLd(buildResult('User-agent: *\nAllow: /'));

  it('emits valid JSON once the comment header is stripped', () => {
    const json = output.slice(output.indexOf('['));
    const parsed = JSON.parse(json) as { '@type': string }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.map((block) => block['@type'])).toContain('Organization');
    expect(parsed.map((block) => block['@type'])).toContain('WebSite');
  });

  it('fills in the real site name and URL', () => {
    expect(output).toContain('"name": "Acme"');
    expect(output).toContain('"url": "https://acme.test"');
  });

  it('marks the values a human must supply', () => {
    expect(output).toContain('REPLACE-WITH');
  });
});

describe('generateAll', () => {
  it('returns all four files with content', () => {
    const files = generateAll(buildResult('User-agent: *\nAllow: /'));

    expect(Object.keys(files).sort()).toEqual([
      'FIXES.md',
      'llms.txt',
      'robots.txt',
      'schema.jsonld',
    ]);

    for (const [name, body] of Object.entries(files)) {
      expect(body.length, name).toBeGreaterThan(100);
    }
  });

  it('writes a fixes document that names the findings', () => {
    const files = generateAll(buildResult('User-agent: *\nDisallow: /'));
    expect(files['FIXES.md']).toContain('AI readability fixes — acme.test');
    expect(files['FIXES.md']).toContain('Score:');
    expect(files['FIXES.md']).toContain('What to fix, in order');
  });
});

describe('programmatic SEO corpus', () => {
  /**
   * Thin, near-duplicate programmatic pages are a liability, and it would be a
   * poor look on this product in particular. These tests hold the corpus to
   * the same floor the audit applies to a customer's site.
   */

  it('gives every AI crawler its own editorial notes', async () => {
    const { AI_CRAWLERS } = await import('@/lib/audit/crawlers');
    const { CRAWLER_NOTES } = await import('@/content/crawler-notes');

    for (const crawler of AI_CRAWLERS) {
      expect(CRAWLER_NOTES[crawler.token], crawler.token).toBeDefined();
    }
  });

  it('keeps crawler copy distinct rather than templated', async () => {
    const { CRAWLER_NOTES } = await import('@/content/crawler-notes');

    const consequences = Object.values(CRAWLER_NOTES).map((note) => note.consequence);
    const mistakes = Object.values(CRAWLER_NOTES).map((note) => note.commonMistake);

    expect(new Set(consequences).size).toBe(consequences.length);
    expect(new Set(mistakes).size).toBe(mistakes.length);
  });

  it('keeps every platform entry above the thin-content floor', async () => {
    const { PLATFORMS } = await import('@/content/platforms');

    for (const platform of PLATFORMS) {
      const words = [
        platform.verdict,
        platform.mechanism,
        platform.filePlacement,
        ...platform.fixes,
        ...platform.gotchas,
      ]
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;

      expect(words, platform.slug).toBeGreaterThan(200);
    }
  });
});
