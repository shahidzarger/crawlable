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
