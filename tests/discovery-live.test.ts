import { describe, expect, it } from 'vitest';
import { discoverUrls } from '@/lib/audit/discover';
import { analyseRobots } from '@/lib/audit/robots';
import { canonicalKey } from '@/lib/audit/url';

/**
 * Discovery only — no page crawling. Three third-party sites, and a 40-page
 * crawl of each would be 120 requests to servers that did not ask for them.
 * Discovery is a handful of sitemap fetches and proves what is under test.
 */
const TARGETS = [
  { label: 'JS/SSR app', origin: 'https://vercel.com' },
  { label: 'docs, nested sitemaps', origin: 'https://stripe.com' },
  { label: 'e-commerce platform', origin: 'https://www.shopify.com' },
];

/*
 * Opt-in: these hit third-party servers, so they are not part of the default
 * suite. Run with LIVE_CRAWL_TESTS=1 npx vitest run tests/discovery-live.test.ts
 */
describe.skipIf(!process.env.LIVE_CRAWL_TESTS)('discovery stress test (live)', () => {
  for (const target of TARGETS) {
    it(`${target.label}: ${target.origin}`, async () => {
      const robots = await analyseRobots(target.origin);
      const d = await discoverUrls(target.origin, 40, robots.sitemaps);

      console.log(`\n=== ${target.label} — ${target.origin}`);
      console.log(`  robots sitemaps declared: ${robots.sitemaps.length}`);
      console.log(`  source=${d.source} sitemapUrl=${d.sitemapUrl}`);
      console.log(`  discovered=${d.discovered} queued=${d.urls.length}`);
      console.log('  sample:');
      for (const u of d.urls.slice(1, 6)) console.log('    ' + u);

      // Normalisation: no fragments, no tracking parameters, one entry per page.
      const keys = d.urls.map((u) => canonicalKey(u));
      expect(new Set(keys).size, 'every queued URL is a distinct page').toBe(keys.length);
      for (const u of d.urls) {
        expect(u, 'no fragment').not.toContain('#');
        expect(u, 'no campaign tag').not.toMatch(/[?&]utm_/);
        expect(u, 'no click id').not.toMatch(/[?&](fbclid|gclid)=/);
        expect(new URL(u).origin, 'same origin').toBe(new URL(target.origin).origin);
      }

      expect(d.urls.length, 'more than the root alone').toBeGreaterThan(1);
      expect(d.urls.length, 'respects the 40-page cap').toBeLessThanOrEqual(40);
      console.log(`  RESULT: ${d.urls.length} URLs, all normalised and same-origin`);
    }, 180000);
  }
});
