import { randomUUID } from 'node:crypto';
import { analysePage } from './extract';
import { analyseRobots } from './robots';
import { analyseLlmsTxt } from './llmstxt';
import { discoverUrls, mapWithConcurrency } from './discover';
import { gradeFor, invisibleShare, overallScore, readablePages, runChecks } from './scoring';
import { generateAll } from './generators';
import { assertPublicHost, normaliseUrl, toOrigin } from './fetcher';
import type { AuditResult, AuditSummary } from './types';

export * from './types';
export { AI_CRAWLERS, VISIBILITY_CRITICAL_CRAWLERS, NON_RENDERING_CRAWLERS } from './crawlers';
export { prioritisedFindings } from './scoring';
export { generateAll, robotsChangeSummary } from './generators';
export { normaliseUrl, toOrigin, FetchError } from './fetcher';

/** Pages fetched in parallel. Deliberately polite — this hits other people's servers. */
const CRAWL_CONCURRENCY = 4;

export const PAGE_LIMITS = {
  scan: 1,
  audit: 40,
} as const;

export interface RunAuditOptions {
  url: string;
  mode: 'scan' | 'audit';
  /** Override the page cap, bounded by the mode's own limit. */
  maxPages?: number;
}

/**
 * Run a full audit.
 *
 * The free scan fetches one page plus robots.txt and llms.txt. A paid audit
 * discovers up to 40 representative URLs, analyses each as a non-rendering
 * crawler would, and generates the fix files.
 */
export async function runAudit(options: RunAuditOptions): Promise<AuditResult> {
  const started = Date.now();
  const { mode } = options;

  const entry = normaliseUrl(options.url);
  const origin = toOrigin(options.url);

  /*
   * Resolve and check the host once, before any work starts.
   *
   * Every individual fetch re-checks this too, so a blocked host never reaches
   * the network either way. Doing it here as well is about the answer the
   * caller gets: without it, a private address produces a complete report full
   * of fetch failures and a meaningless score, when what the caller needs is a
   * 400 saying the host cannot be audited.
   */
  await assertPublicHost(entry.hostname);

  const limit = Math.max(
    1,
    Math.min(options.maxPages ?? PAGE_LIMITS[mode], PAGE_LIMITS[mode]),
  );

  // robots.txt and llms.txt are independent of the page crawl.
  const [robots, llmsTxt] = await Promise.all([
    analyseRobots(origin),
    analyseLlmsTxt(origin),
  ]);

  let targets: string[];
  if (mode === 'scan') {
    targets = [entry.toString()];
  } else {
    const discovery = await discoverUrls(origin, limit, robots.sitemaps);
    // Always audit the exact URL the customer entered, even if the sitemap
    // sample did not include it.
    const entryUrl = entry.toString();
    targets = discovery.urls.includes(entryUrl)
      ? discovery.urls
      : [entryUrl, ...discovery.urls].slice(0, limit);
  }

  const pages = await mapWithConcurrency(targets, CRAWL_CONCURRENCY, (url) =>
    analysePage(url),
  );

  const checks = runChecks(pages, robots, llmsTxt);
  const score = overallScore(checks);
  const readable = readablePages(pages);

  const result: AuditResult = {
    id: randomUUID(),
    siteUrl: origin,
    mode,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    score,
    grade: gradeFor(score),
    invisiblePercent: invisibleShare(pages),
    pagesAudited: readable.length,
    pagesFailed: pages.length - readable.length,
    checks,
    pages,
    robots,
    llmsTxt,
  };

  if (mode === 'audit') {
    result.generated = generateAll(result);
  }

  return result;
}

export function toSummary(result: AuditResult): AuditSummary {
  return {
    id: result.id,
    siteUrl: result.siteUrl,
    mode: result.mode,
    createdAt: result.createdAt,
    score: result.score,
    grade: result.grade,
    invisiblePercent: result.invisiblePercent,
    pagesAudited: result.pagesAudited,
  };
}

/**
 * Strip the paid deliverables from a result so a free scan can be returned
 * over the public API without leaking what the audit generates.
 */
export function redactForFreeScan(result: AuditResult): AuditResult {
  const { generated: _generated, ...rest } = result;
  return {
    ...rest,
    pages: rest.pages.map((page) => ({ ...page, jsonLd: [] })),
    robots: { ...rest.robots, raw: null },
    llmsTxt: { ...rest.llmsTxt, raw: null },
  };
}
