import * as cheerio from 'cheerio';
import { safeFetch, tryFetch, normaliseUrl } from './fetcher';

/**
 * URL discovery: sitemap first, homepage links as a fallback.
 *
 * The goal is a representative sample of real content pages, not an exhaustive
 * crawl — a 30-page audit that covers the homepage, docs, product and blog
 * tells you everything a 3,000-page crawl would about AI readability.
 */

const SITEMAP_CANDIDATES = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap/sitemap.xml',
];

/** Paths that never carry the content an AI crawler would cite. */
const EXCLUDED_PATTERNS = [
  /\/wp-admin/i,
  /\/wp-json/i,
  /\/cart|\/checkout|\/account|\/login|\/signin|\/signup|\/logout/i,
  /\?(?:.*&)?(?:add-to-cart|replytocom|utm_)/i,
  /\/feed\/?$/i,
  /\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|pdf|zip|mp4|webm|woff2?|ttf|xml|json)$/i,
];

function isAuditable(url: URL, origin: string): boolean {
  if (url.origin !== origin) return false;
  const full = url.pathname + url.search;
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(full));
}

function normaliseForDedupe(url: URL): string {
  const copy = new URL(url.toString());
  copy.hash = '';
  // Trailing slashes are the single biggest source of duplicate crawl targets.
  if (copy.pathname.length > 1 && copy.pathname.endsWith('/')) {
    copy.pathname = copy.pathname.slice(0, -1);
  }
  return copy.toString();
}

/** Parse a sitemap or sitemap index, following nested indexes one level deep. */
export async function parseSitemap(
  sitemapUrl: string,
  origin: string,
  limit: number,
  depth = 0,
): Promise<string[]> {
  const response = await tryFetch(sitemapUrl, { allowAnyContentType: true });
  if (!response || response.status !== 200) return [];
  if (!/<(?:urlset|sitemapindex)/i.test(response.body)) return [];

  const $ = cheerio.load(response.body, { xmlMode: true });
  const found: string[] = [];

  const nestedIndexes: string[] = [];
  $('sitemapindex > sitemap > loc').each((_, element) => {
    const loc = $(element).text().trim();
    if (loc) nestedIndexes.push(loc);
  });

  if (nestedIndexes.length > 0 && depth < 1) {
    // Take the first few child sitemaps; large sites list dozens.
    for (const nested of nestedIndexes.slice(0, 5)) {
      if (found.length >= limit) break;
      const childUrls = await parseSitemap(nested, origin, limit - found.length, depth + 1);
      found.push(...childUrls);
    }
    return found.slice(0, limit);
  }

  $('urlset > url > loc').each((_, element) => {
    if (found.length >= limit) return;
    const loc = $(element).text().trim();
    if (!loc) return;
    try {
      const url = new URL(loc);
      if (isAuditable(url, origin)) found.push(normaliseForDedupe(url));
    } catch {
      // Ignore malformed entries.
    }
  });

  return found.slice(0, limit);
}

/** Collect same-origin links from the homepage as a sitemap fallback. */
export async function discoverFromHomepage(
  origin: string,
  limit: number,
): Promise<string[]> {
  const response = await tryFetch(origin);
  if (!response || response.status >= 400) return [];

  const $ = cheerio.load(response.body);
  const found = new Set<string>();

  $('a[href]').each((_, element) => {
    if (found.size >= limit) return;
    const href = $(element).attr('href');
    if (!href) return;
    try {
      const url = new URL(href, response.finalUrl);
      if (isAuditable(url, origin)) found.add(normaliseForDedupe(url));
    } catch {
      // Ignore malformed hrefs.
    }
  });

  return [...found].slice(0, limit);
}

export interface DiscoveryResult {
  urls: string[];
  source: 'sitemap' | 'homepage' | 'root-only';
  sitemapUrl: string | null;
}

/**
 * Build the audit target list for an origin.
 * Always includes the origin root, then fills up to `limit` from the best
 * available source.
 */
export async function discoverUrls(
  origin: string,
  limit: number,
  sitemapHints: string[] = [],
): Promise<DiscoveryResult> {
  const root = normaliseUrl(origin).origin;
  const ordered: string[] = [root];
  const seen = new Set([normaliseForDedupe(new URL(root))]);

  const push = (candidates: string[]): void => {
    for (const candidate of candidates) {
      if (ordered.length >= limit) return;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      ordered.push(candidate);
    }
  };

  const candidates = [
    ...sitemapHints,
    ...SITEMAP_CANDIDATES.map((path) => new URL(path, root).toString()),
  ];

  let usedSitemap: string | null = null;
  for (const candidate of candidates) {
    if (ordered.length >= limit) break;
    const urls = await parseSitemap(candidate, root, limit * 3);
    if (urls.length > 0) {
      usedSitemap = candidate;
      // Prefer breadth: sample evenly across the sitemap rather than taking
      // the first N, which on most sites are all the same section.
      const step = Math.max(1, Math.floor(urls.length / Math.max(1, limit - 1)));
      const sampled: string[] = [];
      for (let i = 0; i < urls.length && sampled.length < limit; i += step) {
        const url = urls[i];
        if (url) sampled.push(url);
      }
      push(sampled);
      break;
    }
  }

  if (usedSitemap && ordered.length > 1) {
    return { urls: ordered.slice(0, limit), source: 'sitemap', sitemapUrl: usedSitemap };
  }

  const homepageLinks = await discoverFromHomepage(root, limit * 2);
  push(homepageLinks);

  return {
    urls: ordered.slice(0, limit),
    source: ordered.length > 1 ? 'homepage' : 'root-only',
    sitemapUrl: usedSitemap,
  };
}

/** Run an async mapper over a list with a fixed concurrency ceiling. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function probeUrl(url: string): Promise<boolean> {
  try {
    const response = await safeFetch(url);
    return response.status < 400;
  } catch {
    return false;
  }
}
