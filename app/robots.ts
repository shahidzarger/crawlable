import type { MetadataRoute } from 'next';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { PRODUCTION_ORIGIN, isNonProductionOrigin } from '@/lib/site-url';

/**
 * Our own robots.txt, generated from the same crawler registry the audit uses.
 *
 * Every AI crawler gets its own explicit User-agent block rather than being
 * left to the wildcard. That is partly practice-what-you-preach — a tool that
 * tells people to name AI crawlers in their robots.txt should demonstrably do
 * so itself — and partly defensive: several of these tokens (Google-Extended,
 * Applebot-Extended) are opt-out signals that some parsers only honour when
 * named directly, so an explicit Allow removes the ambiguity.
 *
 * REQUIRED_TOKENS is asserted by tests/seo.test.ts. Renaming a crawler in the
 * registry would otherwise silently drop it from robots.txt.
 */

/** Blocked for every agent: private surfaces and the API. */
const DISALLOW = ['/dashboard', '/audit/', '/api/'];

/**
 * The AI crawlers whose presence in robots.txt is not negotiable, because the
 * product's own marketing names them.
 */
export const REQUIRED_TOKENS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
] as const;

export default function robots(): MetadataRoute.Robots {
  /*
   * A preview deployment must not be indexable. Two identical sites in the
   * index split their own ranking signals, and the preview is the one with no
   * backlinks, so it is the one that looks like the copy.
   */
  if (isNonProductionOrigin()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      // Named AI crawlers first, so the file reads as a deliberate allowlist.
      ...AI_CRAWLERS.map((crawler) => ({
        userAgent: crawler.token,
        allow: '/',
        disallow: DISALLOW,
      })),
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    // Absolute and always production: a sitemap URL is origin-scoped, and
    // pointing it anywhere else is how preview URLs end up in the index.
    sitemap: `${PRODUCTION_ORIGIN}/sitemap.xml`,
    host: PRODUCTION_ORIGIN,
  };
}
