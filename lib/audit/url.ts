/**
 * Canonical URL handling for the crawler.
 *
 * Two functions, and the difference between them is the whole design:
 *
 *   normaliseForCrawl — the URL we will actually request. Only transformations
 *     that no origin server can reasonably disagree with: drop the fragment,
 *     drop tracking parameters, order the remaining parameters.
 *
 *   canonicalKey — the identity we deduplicate on. Everything above, plus the
 *     trailing slash collapsed.
 *
 * Splitting them costs a few lines and saves a redirect per page. Collapsing
 * "/blog/" to "/blog" in the *fetch* URL looks harmless until the site runs
 * Hugo, Jekyll, or Next with trailingSlash: true — then every one of the 40
 * audited pages answers 301 and we pay a second round trip for each, roughly
 * twelve seconds inside a forty-five second budget, to arrive back at the URL
 * the sitemap gave us in the first place. So the crawler keeps the spelling
 * the site published and only *counts* by the collapsed form.
 */

/**
 * Query parameters that identify a referrer or campaign rather than content.
 *
 * The bar for this list is that removing the parameter cannot change what the
 * server returns. That is why `source`, `id`, `page`, `q`, `lang` and friends
 * are absent however tracking-ish they look: plenty of sites route on them,
 * and a stripped parameter that mattered turns a real page into a 404 or, far
 * worse, silently into a different page than the one we report on.
 */
const TRACKING_PARAMS = new Set([
  // Google
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'srsltid',
  // Meta, Microsoft, X, TikTok, LinkedIn, Yandex
  'fbclid',
  'msclkid',
  'twclid',
  'ttclid',
  'igshid',
  'yclid',
  'li_fat_id',
  'trk',
  'trkCampaign',
  // Email and marketing platforms
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  'vero_id',
  'vero_conv',
  'oly_anon_id',
  'oly_enc_id',
  'epik',
  's_kwcid',
  'ef_id',
  'cmpid',
  // Generic referrer markers
  'ref',
  'ref_src',
  'referrer',
  'spm',
  'scm',
]);

/** Parameter families, matched by prefix. */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_', 'hsa_', '_ga'];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAMS.has(name) || TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function toUrl(input: string | URL): URL {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  /*
   * Anything that is not http(s) is not a crawl target. `new URL` happily
   * parses "javascript:void(0)" and "mailto:hi@x.com" — both appear in real
   * href attributes — so without this they would key successfully and take a
   * slot in the queue.
   */
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Not a crawlable URL: ${url.protocol}`);
  }
  return url;
}

/**
 * Remove tracking parameters and put the survivors in a stable order.
 *
 * Ordering matters for deduplication: ?a=1&b=2 and ?b=2&a=1 are the same page
 * to every server anyone is likely to audit, but different strings, and a
 * different string is a second crawl and a second row in the page count.
 */
function cleanSearch(url: URL): void {
  const kept: Array<[string, string]> = [];
  for (const [name, value] of url.searchParams) {
    if (isTrackingParam(name)) continue;
    kept.push([name, value]);
  }

  if (kept.length === 0) {
    url.search = '';
    return;
  }

  kept.sort(([a, aValue], [b, bValue]) =>
    a === b ? aValue.localeCompare(bValue) : a.localeCompare(b),
  );

  const params = new URLSearchParams();
  for (const [name, value] of kept) params.append(name, value);
  url.search = params.toString();
}

/**
 * The URL to request: safe to fetch, free of fragments and tracking noise.
 *
 * The hostname is lowercased and a default port dropped by the URL parser
 * itself. The path is left exactly as authored — paths are case-sensitive on
 * most origins, so "fixing" their case is how a crawler invents 404s.
 */
export function normaliseForCrawl(input: string | URL): string {
  const url = toUrl(input);
  url.hash = '';
  cleanSearch(url);
  return url.toString();
}

/**
 * The deduplication identity for a URL.
 *
 * Never fetched — only compared. This is where the trailing slash goes, so
 * that /blog and /blog/ are one page in the crawl queue and one page in the
 * audit count, while the crawler still requests whichever spelling the site
 * published.
 *
 * The root is exempt: "https://example.com" and "https://example.com/" are the
 * same request, and stripping the root's slash would leave a bare origin that
 * reads as a different shape of string everywhere it is compared.
 */
export function canonicalKey(input: string | URL): string {
  const url = toUrl(normaliseForCrawl(input));
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.pathname === '') url.pathname = '/';
  }
  return url.toString();
}

/** canonicalKey that returns null instead of throwing on malformed input. */
export function safeCanonicalKey(input: string | URL): string | null {
  try {
    return canonicalKey(input);
  } catch {
    return null;
  }
}

/**
 * Collapse a list of URLs to one entry per canonical identity.
 *
 * The FIRST spelling of each identity wins, which is what preserves crawl
 * ordering guarantees elsewhere: the entry URL the customer typed is placed at
 * index 0 by the caller, and it must still be at index 0 afterwards.
 * Unparseable entries are dropped rather than passed through, because a URL
 * that cannot be keyed cannot be proven unique.
 */
export function dedupeUrls(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const url of urls) {
    const key = safeCanonicalKey(url);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }

  return out;
}

/**
 * Collapse any list of items that carry a URL, keeping the first of each
 * identity. Used post-crawl, where two queued URLs can still turn out to be
 * one page because they redirected to the same place — a collapse no amount of
 * pre-crawl normalisation can predict.
 */
export function dedupeByUrl<T>(items: readonly T[], urlOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = safeCanonicalKey(urlOf(item));
    // An unkeyable URL is kept: these are real fetched pages, and dropping one
    // would understate the audit. Only proven duplicates are removed.
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(item);
  }

  return out;
}
