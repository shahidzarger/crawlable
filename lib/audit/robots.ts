import { AI_CRAWLERS, type AiCrawler } from './crawlers';
import { tryFetch } from './fetcher';
import type { CrawlerAccess, RobotsAnalysis, RobotsRuleGroup } from './types';

/**
 * A robots.txt parser that follows the matching rules real crawlers use:
 * consecutive User-agent lines share one rule group, the longest matching
 * path wins, and Allow beats Disallow on an equal-length tie.
 */

export function parseRobots(raw: string): {
  groups: RobotsRuleGroup[];
  sitemaps: string[];
} {
  const groups: RobotsRuleGroup[] = [];
  const sitemaps: string[] = [];

  let current: RobotsRuleGroup | null = null;
  // True while we are still collecting the User-agent lines of one group.
  let collectingAgents = false;

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.split('#')[0] ?? '';
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;

    const field = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();
    if (!value) continue;

    switch (field) {
      case 'user-agent': {
        if (!collectingAgents || !current) {
          current = { userAgents: [], allow: [], disallow: [], crawlDelay: null };
          groups.push(current);
          collectingAgents = true;
        }
        current.userAgents.push(value);
        break;
      }
      case 'allow': {
        if (!current) break;
        collectingAgents = false;
        current.allow.push(value);
        break;
      }
      case 'disallow': {
        if (!current) break;
        collectingAgents = false;
        current.disallow.push(value);
        break;
      }
      case 'crawl-delay': {
        if (!current) break;
        collectingAgents = false;
        const parsed = Number.parseFloat(value);
        if (!Number.isNaN(parsed)) current.crawlDelay = parsed;
        break;
      }
      case 'sitemap': {
        sitemaps.push(value);
        break;
      }
      default:
        break;
    }
  }

  return { groups, sitemaps };
}

/**
 * Select the rule group that applies to a user-agent token. An exact
 * case-insensitive match wins; otherwise the longest matching prefix wins;
 * otherwise the `*` group applies.
 */
export function selectGroup(
  groups: RobotsRuleGroup[],
  token: string,
): { group: RobotsRuleGroup | null; explicit: boolean } {
  const needle = token.toLowerCase();
  let best: RobotsRuleGroup | null = null;
  let bestLength = -1;

  for (const group of groups) {
    for (const agent of group.userAgents) {
      const candidate = agent.toLowerCase();
      if (candidate === '*') continue;
      if (needle === candidate || needle.startsWith(candidate)) {
        if (candidate.length > bestLength) {
          best = group;
          bestLength = candidate.length;
        }
      }
    }
  }

  if (best) return { group: best, explicit: true };

  const wildcard = groups.find((g) =>
    g.userAgents.some((a) => a.trim() === '*'),
  );
  return { group: wildcard ?? null, explicit: false };
}

/** Convert a robots path pattern (supporting * and $) into a regular expression. */
function patternToRegExp(pattern: string): RegExp {
  let source = '';
  const endAnchored = pattern.endsWith('$');
  const body = endAnchored ? pattern.slice(0, -1) : pattern;

  for (const char of body) {
    if (char === '*') {
      source += '.*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  return new RegExp(`^${source}${endAnchored ? '$' : ''}`);
}

/** Effective length of a pattern for precedence purposes (wildcards excluded). */
function patternWeight(pattern: string): number {
  return pattern.replace(/\*/g, '').length;
}

export function isPathAllowed(group: RobotsRuleGroup | null, path: string): {
  allowed: boolean;
  matchedRule: string | null;
} {
  if (!group) return { allowed: true, matchedRule: null };

  let bestAllow: string | null = null;
  let bestAllowWeight = -1;
  let bestDisallow: string | null = null;
  let bestDisallowWeight = -1;

  for (const rule of group.allow) {
    if (patternToRegExp(rule).test(path)) {
      const weight = patternWeight(rule);
      if (weight > bestAllowWeight) {
        bestAllow = rule;
        bestAllowWeight = weight;
      }
    }
  }

  for (const rule of group.disallow) {
    // An empty Disallow value means "allow everything" and is skipped at parse
    // time, so anything here is a real pattern.
    if (patternToRegExp(rule).test(path)) {
      const weight = patternWeight(rule);
      if (weight > bestDisallowWeight) {
        bestDisallow = rule;
        bestDisallowWeight = weight;
      }
    }
  }

  if (bestDisallow === null) return { allowed: true, matchedRule: bestAllow ? `Allow: ${bestAllow}` : null };
  if (bestAllow === null) return { allowed: false, matchedRule: `Disallow: ${bestDisallow}` };

  // Longest match wins; Allow wins ties.
  if (bestAllowWeight >= bestDisallowWeight) {
    return { allowed: true, matchedRule: `Allow: ${bestAllow}` };
  }
  return { allowed: false, matchedRule: `Disallow: ${bestDisallow}` };
}

export function evaluateCrawlerAccess(
  groups: RobotsRuleGroup[],
  path = '/',
  crawlers: readonly AiCrawler[] = AI_CRAWLERS,
): CrawlerAccess[] {
  return crawlers.map((crawler) => {
    const { group, explicit } = selectGroup(groups, crawler.token);
    const { allowed, matchedRule } = isPathAllowed(group, path);
    return { crawler, allowed, explicit, matchedRule };
  });
}

export async function analyseRobots(origin: string): Promise<RobotsAnalysis> {
  const url = new URL('/robots.txt', origin).toString();
  const response = await tryFetch(url, { allowAnyContentType: true });

  if (!response) {
    return {
      found: false,
      url,
      status: null,
      raw: null,
      groups: [],
      sitemaps: [],
      crawlerAccess: evaluateCrawlerAccess([]),
      error: 'robots.txt could not be fetched.',
    };
  }

  if (response.status !== 200) {
    return {
      found: false,
      url,
      status: response.status,
      raw: null,
      groups: [],
      sitemaps: [],
      crawlerAccess: evaluateCrawlerAccess([]),
      error: null,
    };
  }

  // A server that returns the site's HTML for /robots.txt has no robots file.
  if (/^\s*<(?:!doctype|html)/i.test(response.body)) {
    return {
      found: false,
      url,
      status: response.status,
      raw: null,
      groups: [],
      sitemaps: [],
      crawlerAccess: evaluateCrawlerAccess([]),
      error: 'The server returned HTML instead of a robots.txt file.',
    };
  }

  const { groups, sitemaps } = parseRobots(response.body);

  return {
    found: true,
    url,
    status: response.status,
    raw: response.body.slice(0, 20_000),
    groups,
    sitemaps,
    crawlerAccess: evaluateCrawlerAccess(groups),
    error: null,
  };
}

/** The token site owners use to name our crawler in robots.txt. */
export const CRAWLABLE_BOT_TOKEN = 'CrawlableBot';

/**
 * Has this site explicitly opted out of being audited by us?
 *
 * The audit deliberately does not obey robots.txt in general — its job is to
 * measure what an AI crawler would receive, and a site that blocks everything
 * still needs to be told so. But a site owner who names CrawlableBot by hand
 * is not configuring their AI visibility; they are telling us specifically to
 * go away, and that is a request with no legitimate reason to refuse.
 *
 * Note the `explicit` requirement. A wildcard `Disallow: /` does NOT trigger
 * this: honouring it would make the product unable to audit a large share of
 * the sites that most need auditing, and the owner never asked us anything.
 * Only a group that names this crawler counts.
 */
export function isCrawlableBotOptedOut(analysis: RobotsAnalysis): boolean {
  if (!analysis.found) return false;

  const { group, explicit } = selectGroup(analysis.groups, CRAWLABLE_BOT_TOKEN);
  if (!explicit || !group) return false;

  return !isPathAllowed(group, '/').allowed;
}
