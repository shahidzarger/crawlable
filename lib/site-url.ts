/**
 * Public origin resolution.
 *
 * Canonical URLs, the sitemap, JSON-LD and llms.txt all have to agree on one
 * origin, and getting it wrong is exactly the kind of metadata defect this
 * product exists to catch — so the precedence is deliberate:
 *
 *   1. VERCEL_PROJECT_PRODUCTION_URL — set by Vercel at build and run time to
 *      the project's production domain (the custom domain once one is added,
 *      the .vercel.app alias until then). It is always right on Vercel, and it
 *      cannot drift the way a hand-set variable can.
 *   2. NEXT_PUBLIC_SITE_URL — the explicit override, and the only source that
 *      exists outside Vercel.
 *   3. localhost, for development.
 *
 * Vercel's value is a bare hostname with no scheme, so it is normalised here.
 */

const FALLBACK = 'http://localhost:3000';

/**
 * The canonical production origin, hardcoded on purpose.
 *
 * robots.txt requires an absolute sitemap URL, and a preview deployment that
 * advertises its own sitemap invites Google to index the preview. So the
 * sitemap directive and the Organization schema's identity always name
 * production, whatever origin the running instance happens to have.
 */
export const PRODUCTION_ORIGIN = 'https://usecrawlable.com';

function withScheme(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function resolveSiteUrl(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) {
    const resolved = withScheme(production);
    if (resolved) return resolved;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    const resolved = withScheme(configured);
    if (resolved) return resolved;
  }

  return FALLBACK;
}

/** The public origin, with no trailing slash. */
export const SITE_URL = resolveSiteUrl();

/**
 * True when this instance is demonstrably not production.
 *
 * Deliberately a positive test for the two origins we know are not production
 * — a Vercel preview alias and localhost — rather than "anything that is not
 * PRODUCTION_ORIGIN". The inverted form would serve `Disallow: /` and deindex
 * the entire site the moment a domain variable was misspelled, which is a far
 * worse failure than a preview getting crawled.
 */
export function isNonProductionOrigin(origin: string = SITE_URL): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith('.vercel.app') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}
