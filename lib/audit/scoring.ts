import { VISIBILITY_CRITICAL_CRAWLERS } from './crawlers';
import type {
  CheckResult,
  Finding,
  LlmsTxtAnalysis,
  PageAnalysis,
  RobotsAnalysis,
  Severity,
} from './types';

/**
 * Scoring.
 *
 * Each check returns 0-100 for its own dimension and carries a weight. The
 * weights encode the product's core claim: whether a crawler can read your
 * content at all matters more than anything else you could tune.
 */

export const CHECK_WEIGHTS = {
  'js-rendering': 35,
  'robots-ai-policy': 25,
  'content-structure': 15,
  'structured-data': 12,
  metadata: 8,
  'llms-txt': 5,
  'crawl-health': 0, // Reported, but folded into the others rather than double-counted.
} as const;

/** Pages below this word count carry too little text for an AI to cite. */
const THIN_CONTENT_WORDS = 250;
/** Below this ratio the document is mostly markup and script. */
const LOW_TEXT_RATIO = 0.08;
/** Cap on how many URLs any single finding lists. */
const MAX_LISTED_URLS = 12;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function finding(
  checkId: Finding['checkId'],
  id: string,
  severity: Severity,
  title: string,
  detail: string,
  remedy: string,
  urls: string[] = [],
): Finding {
  return {
    id,
    checkId,
    severity,
    title,
    detail,
    remedy,
    affectedUrls: urls.slice(0, MAX_LISTED_URLS),
    affectedCount: urls.length,
  };
}

/** Pages that actually returned content, i.e. everything except hard failures. */
export function readablePages(pages: PageAnalysis[]): PageAnalysis[] {
  return pages.filter((page) => page.error === null);
}

/**
 * A page is "invisible" when a non-rendering crawler would come away with
 * effectively no content: an unhydrated shell, or a body too thin to cite.
 */
export function isInvisibleToAi(page: PageAnalysis): boolean {
  if (page.error !== null) return true;
  if (page.isSpaShell) return true;
  if (page.rawWordCount < 100) return true;
  return false;
}

export function invisibleShare(pages: PageAnalysis[]): number {
  if (pages.length === 0) return 0;
  const invisible = pages.filter(isInvisibleToAi).length;
  return Math.round((invisible / pages.length) * 100);
}

export function checkJsRendering(pages: PageAnalysis[]): CheckResult {
  const findings: Finding[] = [];
  const readable = readablePages(pages);
  const total = readable.length;

  const shells = readable.filter((page) => page.isSpaShell);
  const thin = readable.filter(
    (page) => !page.isSpaShell && page.rawWordCount < THIN_CONTENT_WORDS,
  );
  const lowRatio = readable.filter(
    (page) =>
      !page.isSpaShell &&
      page.textToHtmlRatio < LOW_TEXT_RATIO &&
      page.rawWordCount >= THIN_CONTENT_WORDS,
  );

  if (shells.length > 0) {
    const framework = shells.find((page) => page.framework)?.framework;
    findings.push(
      finding(
        'js-rendering',
        'spa-shell',
        'critical',
        `${shells.length} of ${total} pages return an empty shell to AI crawlers`,
        `These pages serve almost no text until JavaScript runs${
          framework ? ` (${framework} detected)` : ''
        }. GPTBot, ClaudeBot, PerplexityBot and the other non-rendering crawlers read the raw HTML only, so they see the shell and move on. Example evidence: ${
          shells[0]?.spaSignals[0] ?? 'the framework mount point is empty.'
        }`,
        'Serve the primary content in the initial HTML response. Use server-side rendering or static generation for these routes — in Next.js that means a Server Component or generateStaticParams; in Vue/Nuxt, `ssr: true`; for a hand-rolled SPA, prerender the routes at build time.',
        shells.map((page) => page.url),
      ),
    );
  }

  if (thin.length > 0) {
    findings.push(
      finding(
        'js-rendering',
        'thin-raw-content',
        thin.length > total / 2 ? 'critical' : 'warning',
        `${thin.length} pages carry fewer than ${THIN_CONTENT_WORDS} words of readable text`,
        'There is real content in the raw HTML, but not enough of it for an answer engine to extract a substantive, citable passage. Pages this thin are rarely selected as a source.',
        'Expand the server-rendered body of these pages, or consolidate them into fewer, deeper pages. Aim for 400+ words of substantive text present before hydration.',
        thin.map((page) => page.url),
      ),
    );
  }

  if (lowRatio.length > 0) {
    findings.push(
      finding(
        'js-rendering',
        'low-text-ratio',
        'info',
        `${lowRatio.length} pages are heavily markup-dominated`,
        'These pages have enough words, but the text is a small fraction of the document. Deeply nested wrappers and inline scripts raise extraction cost and dilute the content signal.',
        'Reduce inline script payloads and wrapper nesting, and move analytics and widget bundles to deferred external files.',
        lowRatio.map((page) => page.url),
      ),
    );
  }

  if (findings.length === 0 && total > 0) {
    findings.push(
      finding(
        'js-rendering',
        'rendering-ok',
        'pass',
        'Every audited page serves its content in raw HTML',
        'A crawler that does not execute JavaScript still receives the full page content. This is the single most important property for AI visibility and the site has it.',
        '',
      ),
    );
  }

  // Shells are disqualifying; thin pages cost proportionally less.
  const shellPenalty = total > 0 ? (shells.length / total) * 100 : 0;
  const thinPenalty = total > 0 ? (thin.length / total) * 35 : 0;
  const ratioPenalty = total > 0 ? (lowRatio.length / total) * 10 : 0;
  const score = total === 0 ? 0 : clamp(100 - shellPenalty - thinPenalty - ratioPenalty);

  return {
    id: 'js-rendering',
    label: 'Raw-HTML readability',
    score: Math.round(score),
    weight: CHECK_WEIGHTS['js-rendering'],
    summary:
      total === 0
        ? 'No pages could be fetched.'
        : shells.length > 0
          ? `${shells.length} of ${total} pages are invisible to non-rendering AI crawlers.`
          : `All ${total} audited pages serve readable content without JavaScript.`,
    findings,
  };
}

export function checkRobotsPolicy(robots: RobotsAnalysis): CheckResult {
  const findings: Finding[] = [];

  if (!robots.found) {
    findings.push(
      finding(
        'robots-ai-policy',
        'robots-missing',
        'warning',
        'No robots.txt file',
        robots.error
          ? `${robots.error} Without a robots.txt you have no stated position on AI crawling: every bot is permitted by default, including ones you may not want.`
          : 'Without a robots.txt you have no stated position on AI crawling. Every bot is permitted by default, including ones you may not want.',
        'Publish a robots.txt at the site root that explicitly allows the retrieval crawlers you want to be cited by and declares your position on training crawlers.',
      ),
    );

    return {
      id: 'robots-ai-policy',
      label: 'AI crawler policy',
      score: 55,
      weight: CHECK_WEIGHTS['robots-ai-policy'],
      summary: 'No robots.txt found — crawling is permitted by default but undeclared.',
      findings,
    };
  }

  const blockedCritical = robots.crawlerAccess.filter(
    (access) => !access.allowed && access.crawler.blockingCostsVisibility,
  );
  const blockedTraining = robots.crawlerAccess.filter(
    (access) => !access.allowed && !access.crawler.blockingCostsVisibility,
  );
  const namedExplicitly = robots.crawlerAccess.filter((access) => access.explicit);

  if (blockedCritical.length > 0) {
    findings.push(
      finding(
        'robots-ai-policy',
        'blocking-retrieval-crawlers',
        'critical',
        `Blocking ${blockedCritical.length} crawler(s) that decide whether you get cited`,
        `${blockedCritical
          .map((a) => `${a.crawler.name} (${a.crawler.operator})`)
          .join(', ')} cannot fetch your pages. These are retrieval and user-action crawlers, not training crawlers: blocking them removes you from the answers real users see. Matched rule: ${
          blockedCritical[0]?.matchedRule ?? 'Disallow: /'
        }${blockedCritical[0]?.explicit ? '' : ' (inherited from the User-agent: * group)'}.`,
        'Add explicit Allow groups for the retrieval crawlers before any blanket Disallow. Blocking training crawlers is a separate, legitimate decision that costs you nothing in visibility.',
      ),
    );
  }

  if (blockedTraining.length > 0) {
    findings.push(
      finding(
        'robots-ai-policy',
        'blocking-training-crawlers',
        'info',
        `Blocking ${blockedTraining.length} training crawler(s)`,
        `${blockedTraining
          .map((a) => a.crawler.name)
          .join(', ')} cannot fetch your pages. This is a content-licensing choice and has no effect on whether you appear in AI answers.`,
        'No action needed unless the block is unintentional.',
      ),
    );
  }

  if (namedExplicitly.length === 0) {
    findings.push(
      finding(
        'robots-ai-policy',
        'no-explicit-ai-rules',
        'warning',
        'No AI crawler is named explicitly in robots.txt',
        'Every AI crawler is falling back to your User-agent: * group. That works until you add a blanket Disallow for some unrelated reason and silently cut yourself out of AI answers.',
        'Name the AI crawlers you care about in their own groups so your intent survives future edits to the wildcard group.',
      ),
    );
  }

  if (robots.sitemaps.length === 0) {
    findings.push(
      finding(
        'robots-ai-policy',
        'no-sitemap-directive',
        'warning',
        'robots.txt does not declare a sitemap',
        'Crawlers use the Sitemap: directive to find the full URL set instead of guessing from links. Without it, deep pages may never be discovered.',
        'Add a `Sitemap: https://yourdomain.com/sitemap.xml` line to robots.txt.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      finding(
        'robots-ai-policy',
        'robots-ok',
        'pass',
        'AI crawler policy is explicit and permissive where it matters',
        `All ${VISIBILITY_CRITICAL_CRAWLERS.length} retrieval crawlers can reach your content, and your robots.txt states its intent clearly.`,
        '',
      ),
    );
  }

  let score = 100;
  score -= blockedCritical.length * 22;
  if (namedExplicitly.length === 0) score -= 12;
  if (robots.sitemaps.length === 0) score -= 10;

  return {
    id: 'robots-ai-policy',
    label: 'AI crawler policy',
    score: Math.round(clamp(score)),
    weight: CHECK_WEIGHTS['robots-ai-policy'],
    summary:
      blockedCritical.length > 0
        ? `${blockedCritical.length} retrieval crawler(s) are blocked.`
        : 'Retrieval crawlers can reach your content.',
    findings,
  };
}

export function checkContentStructure(pages: PageAnalysis[]): CheckResult {
  const findings: Finding[] = [];
  const readable = readablePages(pages).filter((page) => !page.isSpaShell);
  const total = readable.length;

  const noH1 = readable.filter((page) => page.h1Count === 0);
  const multiH1 = readable.filter((page) => page.h1Count > 1);
  const flat = readable.filter(
    (page) => page.rawWordCount > 400 && page.headings.filter((h) => h.level === 2).length === 0,
  );
  const skipped = readable.filter((page) => {
    let previous = 0;
    for (const heading of page.headings) {
      if (previous !== 0 && heading.level > previous + 1) return true;
      previous = heading.level;
    }
    return false;
  });

  if (noH1.length > 0) {
    findings.push(
      finding(
        'content-structure',
        'missing-h1',
        'warning',
        `${noH1.length} pages have no H1`,
        'Answer engines use the H1 as the page\'s claim of what it is about. Without one, the model has to infer the topic from the title tag and surrounding text, which weakens the match.',
        'Give every page exactly one H1 that states the page topic in plain language.',
        noH1.map((page) => page.url),
      ),
    );
  }

  if (multiH1.length > 0) {
    findings.push(
      finding(
        'content-structure',
        'multiple-h1',
        'info',
        `${multiH1.length} pages have more than one H1`,
        'Multiple H1s make the page topic ambiguous when content is chunked for retrieval.',
        'Demote the secondary H1s to H2.',
        multiH1.map((page) => page.url),
      ),
    );
  }

  if (flat.length > 0) {
    findings.push(
      finding(
        'content-structure',
        'no-subheadings',
        'warning',
        `${flat.length} substantial pages have no H2 subheadings`,
        'Retrieval systems split pages into chunks at heading boundaries. A long page with no subheadings becomes one undifferentiated block, and the specific passage that answers a question never gets isolated.',
        'Break long pages into H2 sections, each answering one question in its first paragraph.',
        flat.map((page) => page.url),
      ),
    );
  }

  if (skipped.length > 0) {
    findings.push(
      finding(
        'content-structure',
        'skipped-heading-levels',
        'info',
        `${skipped.length} pages skip heading levels`,
        'Jumping from H2 to H4 breaks the implied document outline that chunkers rely on.',
        'Use heading levels in sequence without gaps.',
        skipped.map((page) => page.url),
      ),
    );
  }

  if (findings.length === 0 && total > 0) {
    findings.push(
      finding(
        'content-structure',
        'structure-ok',
        'pass',
        'Content is cleanly structured for chunking',
        'Pages carry a single H1 and a sensible heading hierarchy, so retrieval systems can isolate the passage that answers a given question.',
        '',
      ),
    );
  }

  let score = 100;
  if (total > 0) {
    score -= (noH1.length / total) * 35;
    score -= (flat.length / total) * 30;
    score -= (multiH1.length / total) * 10;
    score -= (skipped.length / total) * 10;
  } else {
    score = 0;
  }

  return {
    id: 'content-structure',
    label: 'Content structure',
    score: Math.round(clamp(score)),
    weight: CHECK_WEIGHTS['content-structure'],
    summary:
      total === 0
        ? 'No readable pages to assess.'
        : findings[0]?.severity === 'pass'
          ? 'Heading structure supports clean chunking.'
          : `${noH1.length + flat.length} pages have structural issues that hurt chunking.`,
    findings,
  };
}

export function checkStructuredData(pages: PageAnalysis[]): CheckResult {
  const findings: Finding[] = [];
  const readable = readablePages(pages);
  const total = readable.length;

  const withSchema = readable.filter((page) => page.schemaTypes.length > 0);
  const broken = readable.filter((page) => page.jsonLd.some((block) => !block.valid));
  const allTypes = new Set<string>();
  for (const page of readable) for (const type of page.schemaTypes) allTypes.add(type);

  const coverage = total > 0 ? withSchema.length / total : 0;

  if (broken.length > 0) {
    findings.push(
      finding(
        'structured-data',
        'invalid-jsonld',
        'critical',
        `${broken.length} pages contain JSON-LD that fails to parse`,
        `A malformed structured-data block is discarded entirely, so the markup you shipped is doing nothing. First error: ${
          broken[0]?.jsonLd.find((b) => !b.valid)?.error ?? 'invalid JSON'
        }`,
        'Fix the JSON syntax and re-validate. Trailing commas and unescaped quotes inside string values are the usual causes.',
        broken.map((page) => page.url),
      ),
    );
  }

  if (coverage === 0 && total > 0) {
    findings.push(
      finding(
        'structured-data',
        'no-structured-data',
        'warning',
        'No JSON-LD structured data anywhere on the site',
        'Structured data is how you state facts about your organisation, products and articles in a form a model does not have to infer from prose — name, author, publish date, price, ratings. Without it, every one of those facts is a guess.',
        'Add Organization schema sitewide, plus Article or Product schema on the matching page types. The audit generates a ready-to-paste block for you.',
      ),
    );
  } else if (coverage < 0.6 && total > 2) {
    const missing = readable.filter((page) => page.schemaTypes.length === 0);
    findings.push(
      finding(
        'structured-data',
        'partial-structured-data',
        'warning',
        `Structured data is present on only ${Math.round(coverage * 100)}% of pages`,
        `Found: ${[...allTypes].slice(0, 8).join(', ')}. The remaining pages state none of their facts in machine-readable form.`,
        'Extend your existing schema coverage to the remaining page types.',
        missing.map((page) => page.url),
      ),
    );
  }

  if (total > 0 && !allTypes.has('Organization') && !allTypes.has('LocalBusiness')) {
    findings.push(
      finding(
        'structured-data',
        'no-organization-schema',
        'warning',
        'No Organization schema',
        'Organization schema is the one block that tells an answer engine who you are, what you are called, and which social and contact identities are yours. It is the anchor for every entity-level answer about your brand.',
        'Add an Organization block to your site-wide layout.',
      ),
    );
  }

  if (findings.length === 0 && total > 0) {
    findings.push(
      finding(
        'structured-data',
        'schema-ok',
        'pass',
        'Structured data is present and valid',
        `Valid JSON-LD on ${withSchema.length} of ${total} pages, covering: ${[...allTypes].slice(0, 8).join(', ')}.`,
        '',
      ),
    );
  }

  let score = Math.round(coverage * 100);
  if (broken.length > 0) score -= 30;
  if (!allTypes.has('Organization') && !allTypes.has('LocalBusiness')) score -= 15;

  return {
    id: 'structured-data',
    label: 'Structured data',
    score: Math.round(clamp(score)),
    weight: CHECK_WEIGHTS['structured-data'],
    summary:
      total === 0
        ? 'No readable pages to assess.'
        : `Valid structured data on ${withSchema.length} of ${total} pages.`,
    findings,
  };
}

export function checkMetadata(pages: PageAnalysis[]): CheckResult {
  const findings: Finding[] = [];
  const readable = readablePages(pages);
  const total = readable.length;

  const noTitle = readable.filter((page) => !page.title);
  const noDescription = readable.filter((page) => !page.metaDescription);
  const noindexed = readable.filter((page) => page.noindex);

  const titleCounts = new Map<string, string[]>();
  for (const page of readable) {
    if (!page.title) continue;
    const list = titleCounts.get(page.title) ?? [];
    list.push(page.url);
    titleCounts.set(page.title, list);
  }
  const duplicateTitles = [...titleCounts.values()].filter((urls) => urls.length > 1);
  const duplicateCount = duplicateTitles.reduce((sum, urls) => sum + urls.length, 0);

  if (noindexed.length > 0) {
    findings.push(
      finding(
        'metadata',
        'noindex-pages',
        'critical',
        `${noindexed.length} pages are marked noindex`,
        'A noindex directive removes these pages from search indexes, and the AI search crawlers that build on those indexes honour it too. If any of these are pages you want cited, they are currently excluded.',
        'Remove the noindex directive from any page you want to appear in AI answers.',
        noindexed.map((page) => page.url),
      ),
    );
  }

  if (noTitle.length > 0) {
    findings.push(
      finding(
        'metadata',
        'missing-title',
        'warning',
        `${noTitle.length} pages have no title tag`,
        'The title is the primary label a citation carries. Without it, a model has nothing to call the page.',
        'Add a unique, descriptive <title> to every page.',
        noTitle.map((page) => page.url),
      ),
    );
  }

  if (duplicateTitles.length > 0) {
    findings.push(
      finding(
        'metadata',
        'duplicate-titles',
        'warning',
        `${duplicateCount} pages share a title with another page`,
        'Duplicate titles make pages indistinguishable at citation time, so the wrong one gets chosen — or neither does.',
        'Give every page a title that describes only that page.',
        duplicateTitles.flat(),
      ),
    );
  }

  if (noDescription.length > 0) {
    findings.push(
      finding(
        'metadata',
        'missing-description',
        'info',
        `${noDescription.length} pages have no meta description`,
        'The meta description is a free, authored one-line summary. When it is missing, the summary gets generated from whatever text happens to be near the top of the page.',
        'Write a one-sentence description for each page that answers what the page is for.',
        noDescription.map((page) => page.url),
      ),
    );
  }

  if (findings.length === 0 && total > 0) {
    findings.push(
      finding(
        'metadata',
        'metadata-ok',
        'pass',
        'Page metadata is complete and unique',
        'Every audited page has a unique title, a description, and no indexing directives blocking it.',
        '',
      ),
    );
  }

  let score = 100;
  if (total > 0) {
    score -= (noindexed.length / total) * 60;
    score -= (noTitle.length / total) * 30;
    score -= (duplicateCount / total) * 20;
    score -= (noDescription.length / total) * 15;
  } else {
    score = 0;
  }

  return {
    id: 'metadata',
    label: 'Page metadata',
    score: Math.round(clamp(score)),
    weight: CHECK_WEIGHTS.metadata,
    summary:
      total === 0
        ? 'No readable pages to assess.'
        : noindexed.length > 0
          ? `${noindexed.length} pages are excluded from indexing.`
          : 'Titles and descriptions are in place.',
    findings,
  };
}

export function checkLlmsTxt(llmsTxt: LlmsTxtAnalysis): CheckResult {
  const findings: Finding[] = [];

  if (!llmsTxt.found) {
    findings.push(
      finding(
        'llms-txt',
        'llms-txt-missing',
        'warning',
        'No llms.txt file',
        'llms.txt is a single markdown file at your site root that tells an agent what your site is and which pages matter. Google has said it does not use it for Search; Anthropic and OpenAI both publish one and recommend it for agent workflows. It costs one file and only ever helps the agent case.',
        'Publish /llms.txt with an H1, a one-paragraph summary blockquote, and sections of annotated absolute links to your key pages. The audit generates this file for you.',
      ),
    );
  } else if (!llmsTxt.wellFormed) {
    findings.push(
      finding(
        'llms-txt',
        'llms-txt-malformed',
        'info',
        'llms.txt exists but does not follow the spec',
        llmsTxt.issues.join(' '),
        'Restructure the file to the spec shape: one H1, a blockquote summary, then H2 sections of annotated absolute links.',
      ),
    );
  } else {
    findings.push(
      finding(
        'llms-txt',
        'llms-txt-ok',
        'pass',
        'llms.txt is present and well-formed',
        `The file follows the spec and points at ${llmsTxt.linkCount} pages.`,
        '',
      ),
    );
  }

  const score = llmsTxt.found ? (llmsTxt.wellFormed ? 100 : 65) : 0;

  return {
    id: 'llms-txt',
    label: 'llms.txt',
    score,
    weight: CHECK_WEIGHTS['llms-txt'],
    summary: llmsTxt.found
      ? llmsTxt.wellFormed
        ? 'Present and well-formed.'
        : 'Present but does not follow the spec.'
      : 'Not published.',
    findings,
  };
}

export function checkCrawlHealth(pages: PageAnalysis[]): CheckResult {
  const findings: Finding[] = [];
  const failed = pages.filter((page) => page.error !== null);
  const slow = readablePages(pages).filter((page) => page.fetchMs > 4_000);

  if (failed.length > 0) {
    findings.push(
      finding(
        'crawl-health',
        'fetch-failures',
        failed.length > pages.length / 3 ? 'critical' : 'warning',
        `${failed.length} pages could not be fetched`,
        `A crawler that gets an error gets nothing. First error: ${failed[0]?.error ?? 'unknown'}.`,
        'Check for server errors, aggressive rate limiting, or a bot-protection rule that is catching legitimate AI crawlers alongside scrapers.',
        failed.map((page) => page.url),
      ),
    );
  }

  if (slow.length > 0) {
    findings.push(
      finding(
        'crawl-health',
        'slow-responses',
        'info',
        `${slow.length} pages took over 4 seconds to respond`,
        'Slow responses reduce crawl budget and cause live-retrieval fetches to time out mid-answer.',
        'Cache HTML at the edge and cut server response time for these routes.',
        slow.map((page) => page.url),
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      finding(
        'crawl-health',
        'crawl-ok',
        'pass',
        'Every page responded cleanly',
        'No fetch failures and no slow responses across the audited pages.',
        '',
      ),
    );
  }

  const score =
    pages.length === 0 ? 0 : Math.round(clamp(100 - (failed.length / pages.length) * 100));

  return {
    id: 'crawl-health',
    label: 'Crawl health',
    score,
    weight: CHECK_WEIGHTS['crawl-health'],
    summary:
      failed.length > 0 ? `${failed.length} of ${pages.length} pages failed to fetch.` : 'All pages responded.',
    findings,
  };
}

export function gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function overallScore(checks: CheckResult[]): number {
  const weighted = checks.filter((check) => check.weight > 0);
  const totalWeight = weighted.reduce((sum, check) => sum + check.weight, 0);
  if (totalWeight === 0) return 0;
  const sum = weighted.reduce((acc, check) => acc + check.score * check.weight, 0);
  return Math.round(sum / totalWeight);
}

export function runChecks(
  pages: PageAnalysis[],
  robots: RobotsAnalysis,
  llmsTxt: LlmsTxtAnalysis,
): CheckResult[] {
  return [
    checkJsRendering(pages),
    checkRobotsPolicy(robots),
    checkContentStructure(pages),
    checkStructuredData(pages),
    checkMetadata(pages),
    checkLlmsTxt(llmsTxt),
    checkCrawlHealth(pages),
  ];
}

/** All findings, ordered so the report leads with what actually costs money. */
export function prioritisedFindings(checks: CheckResult[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  const weightOf = (checkId: Finding['checkId']): number => CHECK_WEIGHTS[checkId] ?? 0;

  return checks
    .flatMap((check) => check.findings)
    .sort((a, b) => {
      const bySeverity = order[a.severity] - order[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return weightOf(b.checkId) - weightOf(a.checkId);
    });
}
