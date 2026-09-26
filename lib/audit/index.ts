import { randomUUID } from 'node:crypto';
import { analysePage } from './extract';
import { analyseRobots, isCrawlableBotOptedOut } from './robots';
import { analyseLlmsTxt } from './llmstxt';
import { discoverUrls, mapWithConcurrency } from './discover';
import { gradeFor, invisibleShare, overallScore, readablePages, runChecks } from './scoring';
import { generateAll } from './generators';
import { FetchError, assertPublicHost, normaliseUrl, toOrigin } from './fetcher';
import { dedupeByUrl, dedupeUrls, normaliseForCrawl } from './url';
import type { AuditResult, AuditSummary } from './types';

export * from './types';
export { AI_CRAWLERS, VISIBILITY_CRITICAL_CRAWLERS, NON_RENDERING_CRAWLERS } from './crawlers';
export { prioritisedFindings } from './scoring';
export { generateAll, robotsChangeSummary } from './generators';
export { normaliseUrl, toOrigin, FetchError } from './fetcher';
export { isCrawlableBotOptedOut, CRAWLABLE_BOT_TOKEN } from './robots';

/** Pages fetched in parallel. Deliberately polite — this hits other people's servers. */
const CRAWL_CONCURRENCY = 4;

/**
 * Wall-clock budget for everything that touches the network.
 *
 * The route's `maxDuration` is 60s. Without a budget the worst case is roughly
 * four times that — ~108s of serial sitemap probing plus ~120s of crawling at
 * four-wide, each request able to burn the full 12s timeout. Vercel then kills
 * the function: the customer gets a bare 504 with no JSON body, the error
 * handling never runs, and — because the credit is debited before the crawl
 * starts — the refund in the catch block never runs either. A silent debit for
 * nothing.
 *
 * 45s leaves roughly 15s for scoring, fix-file generation, the database write
 * and the completion email, plus one in-flight fetch finishing its timeout.
 * Reaching the budget produces a smaller, honest report instead of no report.
 */
export const AUDIT_BUDGET_MS = 45_000;

export const PAGE_LIMITS = {
  scan: 1,
  audit: 40,
} as const;

export interface RunAuditOptions {
  url: string;
  mode: 'scan' | 'audit';
  /** Override the page cap, bounded by the mode's own limit. */
  maxPages?: number;
  /** Override the wall-clock budget. Tests use this; callers should not. */
  budgetMs?: number;
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

  const deadline = started + (options.budgetMs ?? AUDIT_BUDGET_MS);

  const limit = Math.max(
    1,
    Math.min(options.maxPages ?? PAGE_LIMITS[mode], PAGE_LIMITS[mode]),
  );

  // robots.txt and llms.txt are independent of the page crawl.
  const [robots, llmsTxt] = await Promise.all([
    analyseRobots(origin),
    analyseLlmsTxt(origin),
  ]);

  /*
   * The one robots.txt directive this crawler does obey.
   *
   * Checked here, before any page is fetched, so an opted-out site is never
   * touched beyond the robots.txt read itself. The audit route turns this into
   * a 403 and refunds the scan — an opt-out is not a failed audit, and nobody
   * should pay for discovering one.
   */
  if (isCrawlableBotOptedOut(robots)) {
    throw new FetchError(
      `${new URL(origin).host} has opted out of Crawlable audits in its robots.txt.`,
      'bot-opted-out',
    );
  }

  const entryUrl = normaliseForCrawl(entry);

  let targets: string[];
  if (mode === 'scan') {
    targets = [entryUrl];
  } else {
    const discovery = await discoverUrls(origin, limit, robots.sitemaps, deadline);
    /*
     * Always audit the exact URL the customer entered, even if the sitemap
     * sample did not include it — then deduplicate.
     *
     * The membership test used to be a string comparison, which meant the
     * entry URL was re-added whenever discovery had listed the same page under
     * a different spelling: a trailing slash, a utm parameter, a reordered
     * query. The customer paid for forty pages and got thirty-nine plus a copy
     * of the home page. dedupeUrls keeps the first occurrence, so the entry
     * stays at index 0 and is still the last thing a budget overrun drops.
     */
    targets = dedupeUrls([entryUrl, ...discovery.urls]).slice(0, limit);
  }

  /*
   * The entry URL is always index 0 of `targets`, and workers claim indices in
   * order, so the page the customer actually typed is fetched first and is the
   * last thing a budget overrun would drop.
   */
  const settled = await mapWithConcurrency(
    targets,
    CRAWL_CONCURRENCY,
    (url) => analysePage(url),
    { deadline },
  );

  const fetched = settled.filter((page): page is NonNullable<typeof page> => page !== undefined);

  /*
   * pagesSkipped is measured BEFORE deduplication, because it feeds
   * isPartialScan — which decides whether the customer is told their report is
   * incomplete and whether support restores the credit. A page dropped for
   * being a duplicate was not skipped; counting it as one would raise a false
   * partial-scan flag on a perfectly complete audit.
   */
  const pagesSkipped = targets.length - fetched.length;

  /*
   * A final collapse on the post-redirect URL. Two queued URLs can still turn
   * out to be one page — /home redirecting to /, ?p=123 resolving to a slug —
   * and no amount of pre-crawl normalisation can predict a redirect. Without
   * this the page count is inflated and the duplicate-title check flags a page
   * against its own alias.
   */
  const pages = dedupeByUrl(fetched, (page) => page.url);

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
    pagesSkipped,
    isPartialScan: pagesSkipped > 0,
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
