import { describe, expect, it } from 'vitest';
import {
  checkJsRendering,
  checkLlmsTxt,
  checkMetadata,
  checkRobotsPolicy,
  checkStructuredData,
  gradeFor,
  invisibleShare,
  isInvisibleToAi,
  overallScore,
  prioritisedFindings,
  runChecks,
} from '@/lib/audit/scoring';
import { evaluateCrawlerAccess, parseRobots } from '@/lib/audit/robots';
import { failedPage } from '@/lib/audit/extract';
import type { LlmsTxtAnalysis, PageAnalysis, RobotsAnalysis } from '@/lib/audit/types';

function page(overrides: Partial<PageAnalysis> = {}): PageAnalysis {
  return {
    url: 'https://acme.test/',
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
    title: 'Acme',
    metaDescription: 'A description.',
    canonical: null,
    headings: [
      { level: 1, text: 'Acme' },
      { level: 2, text: 'Features' },
    ],
    h1Count: 1,
    jsonLd: [],
    schemaTypes: ['Organization'],
    internalLinks: 10,
    externalLinks: 2,
    imagesMissingAlt: 0,
    imageCount: 3,
    noindex: false,
    error: null,
    ...overrides,
  };
}

function robots(raw: string): RobotsAnalysis {
  const { groups, sitemaps } = parseRobots(raw);
  return {
    found: true,
    url: 'https://acme.test/robots.txt',
    status: 200,
    raw,
    groups,
    sitemaps,
    crawlerAccess: evaluateCrawlerAccess(groups),
    error: null,
  };
}

const NO_LLMS: LlmsTxtAnalysis = {
  found: false,
  url: 'https://acme.test/llms.txt',
  status: 404,
  raw: null,
  wellFormed: false,
  issues: [],
  linkCount: 0,
};

describe('isInvisibleToAi', () => {
  it('counts SPA shells, near-empty pages and failures', () => {
    expect(isInvisibleToAi(page({ isSpaShell: true }))).toBe(true);
    expect(isInvisibleToAi(page({ rawWordCount: 40 }))).toBe(true);
    expect(isInvisibleToAi(failedPage('https://acme.test/x', 'timeout'))).toBe(true);
    expect(isInvisibleToAi(page())).toBe(false);
  });
});

describe('invisibleShare', () => {
  it('is zero for an empty set', () => {
    expect(invisibleShare([])).toBe(0);
  });

  it('rounds to a whole percentage', () => {
    const pages = [page(), page({ isSpaShell: true }), page({ isSpaShell: true })];
    expect(invisibleShare(pages)).toBe(67);
  });
});

describe('checkJsRendering', () => {
  it('scores a fully readable site at 100 and passes', () => {
    const result = checkJsRendering([page(), page()]);
    expect(result.score).toBe(100);
    expect(result.findings[0]?.severity).toBe('pass');
  });

  it('scores an all-shell site at zero with a critical finding', () => {
    const result = checkJsRendering([
      page({ isSpaShell: true, rawWordCount: 5, spaSignals: ['empty root'] }),
      page({ isSpaShell: true, rawWordCount: 5, spaSignals: ['empty root'] }),
    ]);

    expect(result.score).toBe(0);
    expect(result.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('penalises thin pages less than shells', () => {
    const shells = checkJsRendering([page({ isSpaShell: true }), page()]);
    const thin = checkJsRendering([page({ rawWordCount: 120 }), page()]);
    expect(thin.score).toBeGreaterThan(shells.score);
  });

  it('lists the affected URLs', () => {
    const result = checkJsRendering([
      page({ url: 'https://acme.test/a', isSpaShell: true }),
      page({ url: 'https://acme.test/b', isSpaShell: true }),
    ]);

    const finding = result.findings.find((f) => f.id === 'spa-shell');
    expect(finding?.affectedCount).toBe(2);
    expect(finding?.affectedUrls).toContain('https://acme.test/a');
  });
});

describe('checkRobotsPolicy', () => {
  it('is critical when retrieval crawlers are blocked', () => {
    const result = checkRobotsPolicy(robots('User-agent: *\nDisallow: /'));
    expect(result.findings.some((f) => f.severity === 'critical')).toBe(true);
    expect(result.score).toBeLessThan(30);
  });

  it('does not treat a blocked training crawler as critical', () => {
    const result = checkRobotsPolicy(
      robots(`
User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
Sitemap: https://acme.test/sitemap.xml
      `),
    );

    expect(result.findings.some((f) => f.severity === 'critical')).toBe(false);
    expect(result.findings.some((f) => f.id === 'blocking-training-crawlers')).toBe(true);
  });

  it('warns when no AI crawler is named explicitly', () => {
    const result = checkRobotsPolicy(
      robots('User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml'),
    );
    expect(result.findings.some((f) => f.id === 'no-explicit-ai-rules')).toBe(true);
  });

  it('handles a missing robots.txt without failing the site', () => {
    const result = checkRobotsPolicy({
      found: false,
      url: 'https://acme.test/robots.txt',
      status: 404,
      raw: null,
      groups: [],
      sitemaps: [],
      crawlerAccess: evaluateCrawlerAccess([]),
      error: null,
    });

    expect(result.score).toBe(55);
    expect(result.findings[0]?.severity).toBe('warning');
  });
});

describe('checkStructuredData', () => {
  it('flags invalid JSON-LD as critical', () => {
    const result = checkStructuredData([
      page({
        schemaTypes: [],
        jsonLd: [{ raw: '{bad}', valid: false, types: [], error: 'Unexpected token' }],
      }),
    ]);

    expect(result.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('passes when Organization schema is present everywhere', () => {
    const result = checkStructuredData([page(), page()]);
    expect(result.score).toBe(100);
    expect(result.findings[0]?.severity).toBe('pass');
  });

  it('scores zero with no structured data at all', () => {
    const result = checkStructuredData([page({ schemaTypes: [] })]);
    expect(result.score).toBe(0);
  });
});

describe('checkMetadata', () => {
  it('treats noindex as critical', () => {
    const result = checkMetadata([page({ noindex: true })]);
    expect(result.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('detects duplicate titles', () => {
    const result = checkMetadata([
      page({ url: 'https://acme.test/a', title: 'Same' }),
      page({ url: 'https://acme.test/b', title: 'Same' }),
    ]);

    const finding = result.findings.find((f) => f.id === 'duplicate-titles');
    expect(finding?.affectedCount).toBe(2);
  });
});

describe('checkLlmsTxt', () => {
  it('warns when absent but does not fail hard', () => {
    const result = checkLlmsTxt(NO_LLMS);
    expect(result.score).toBe(0);
    expect(result.weight).toBeLessThanOrEqual(5);
    expect(result.findings[0]?.severity).toBe('warning');
  });

  it('passes a well-formed file', () => {
    const result = checkLlmsTxt({
      ...NO_LLMS,
      found: true,
      status: 200,
      wellFormed: true,
      linkCount: 8,
    });

    expect(result.score).toBe(100);
    expect(result.findings[0]?.severity).toBe('pass');
  });
});

describe('overallScore and grading', () => {
  it('weights raw-HTML readability most heavily', () => {
    const goodRendering = runChecks(
      [page()],
      robots('User-agent: *\nDisallow: /'),
      NO_LLMS,
    );
    const badRendering = runChecks(
      [page({ isSpaShell: true, rawWordCount: 3 })],
      robots('User-agent: *\nAllow: /\nSitemap: https://acme.test/sitemap.xml'),
      NO_LLMS,
    );

    expect(overallScore(goodRendering)).toBeGreaterThan(overallScore(badRendering));
  });

  it('ignores zero-weight checks in the total', () => {
    const checks = runChecks([page()], robots('User-agent: *\nAllow: /'), NO_LLMS);
    const weighted = checks.filter((check) => check.weight > 0);
    const expected = Math.round(
      weighted.reduce((sum, check) => sum + check.score * check.weight, 0) /
        weighted.reduce((sum, check) => sum + check.weight, 0),
    );

    expect(overallScore(checks)).toBe(expected);
  });

  it('maps scores to grades at the documented boundaries', () => {
    expect(gradeFor(100)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89)).toBe('B');
    expect(gradeFor(75)).toBe('B');
    expect(gradeFor(74)).toBe('C');
    expect(gradeFor(60)).toBe('C');
    expect(gradeFor(59)).toBe('D');
    expect(gradeFor(40)).toBe('D');
    expect(gradeFor(39)).toBe('F');
    expect(gradeFor(0)).toBe('F');
  });
});

describe('prioritisedFindings', () => {
  it('puts critical findings first and passes last', () => {
    const checks = runChecks(
      [page({ isSpaShell: true, rawWordCount: 4 })],
      robots('User-agent: *\nDisallow: /'),
      NO_LLMS,
    );

    const ordered = prioritisedFindings(checks);
    expect(ordered[0]?.severity).toBe('critical');

    const severities = ordered.map((f) => f.severity);
    const lastCritical = severities.lastIndexOf('critical');
    const firstPass = severities.indexOf('pass');
    if (firstPass !== -1) expect(firstPass).toBeGreaterThan(lastCritical);
  });

  it('breaks severity ties by check weight', () => {
    const checks = runChecks(
      [page({ isSpaShell: true, rawWordCount: 4 })],
      robots('User-agent: *\nDisallow: /'),
      NO_LLMS,
    );

    const criticals = prioritisedFindings(checks).filter((f) => f.severity === 'critical');
    // Raw-HTML readability (weight 35) outranks the robots policy (weight 25).
    expect(criticals[0]?.checkId).toBe('js-rendering');
  });
});
