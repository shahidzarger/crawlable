import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@/lib/plans';
import { siteSchema, serialiseJsonLd } from '@/lib/seo/schema';
import { isNonProductionOrigin } from '@/lib/site-url';
import { SUPPORT_EMAIL } from '@/lib/support';

/**
 * Guards on the metadata that only breaks in public.
 *
 * Every assertion here exists because the failure it prevents is invisible
 * locally: a crawler quietly dropped from robots.txt, a preview deployment
 * competing with production in the index, or a marked-up price that no longer
 * matches the pricing table. None of those show up in a build.
 */

/**
 * robots() and sitemap() read the origin at module load, so each production
 * assertion needs a fresh import with the env in place.
 */
async function loadWithOrigin<T>(origin: string, path: string): Promise<T> {
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
  vi.resetModules();
  return (await import(path)) as T;
}

describe('isNonProductionOrigin', () => {
  it('flags preview aliases and localhost', () => {
    expect(isNonProductionOrigin('https://crawlable-git-main.vercel.app')).toBe(true);
    expect(isNonProductionOrigin('http://localhost:3000')).toBe(true);
    expect(isNonProductionOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('treats production and any unrecognised custom domain as indexable', () => {
    // Deliberately permissive. The inverted test — "anything that is not the
    // production constant" — would deindex the whole site the first time a
    // domain variable was misspelled.
    expect(isNonProductionOrigin('https://usecrawlable.com')).toBe(false);
    expect(isNonProductionOrigin('https://staging.usecrawlable.com')).toBe(false);
    expect(isNonProductionOrigin('not a url')).toBe(false);
  });
});

describe('robots.txt', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('names every crawler the marketing copy promises', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/robots')>(
      'https://usecrawlable.com',
      '@/app/robots',
    );
    const output = mod.default();
    const rules = Array.isArray(output.rules) ? output.rules : [output.rules];
    const agents = rules.map((rule) => rule.userAgent);

    for (const token of mod.REQUIRED_TOKENS) {
      expect(agents, `missing ${token}`).toContain(token);
    }
    expect(agents).toContain('*');
  });

  it('points the sitemap at the production origin, absolutely', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/robots')>(
      'https://usecrawlable.com',
      '@/app/robots',
    );
    expect(mod.default().sitemap).toBe('https://usecrawlable.com/sitemap.xml');
  });

  it('keeps private surfaces out of every allow block', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/robots')>(
      'https://usecrawlable.com',
      '@/app/robots',
    );
    const output = mod.default();
    const rules = Array.isArray(output.rules) ? output.rules : [output.rules];

    for (const rule of rules) {
      expect(rule.disallow).toEqual(['/dashboard', '/audit/', '/api/']);
    }
  });

  it('disallows everything on a preview deployment', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/robots')>(
      'https://crawlable-abc123.vercel.app',
      '@/app/robots',
    );
    const output = mod.default();
    const rules = Array.isArray(output.rules) ? output.rules : [output.rules];

    expect(rules).toHaveLength(1);
    expect(rules[0]?.disallow).toBe('/');
    expect(rules[0]?.allow).toBeUndefined();
    expect(output.sitemap).toBeUndefined();
  });
});

describe('sitemap.xml', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lists the static routes with their intended weighting', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/sitemap')>(
      'https://usecrawlable.com',
      '@/app/sitemap',
    );
    const entries = mod.default();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    const expected: Array<[string, string, number]> = [
      ['https://usecrawlable.com', 'daily', 1],
      ['https://usecrawlable.com/contact', 'monthly', 0.8],
      ['https://usecrawlable.com/terms', 'yearly', 0.5],
      ['https://usecrawlable.com/privacy', 'yearly', 0.5],
    ];

    for (const [url, frequency, priority] of expected) {
      const entry = byUrl.get(url);
      expect(entry, `missing ${url}`).toBeDefined();
      expect(entry?.changeFrequency).toBe(frequency);
      expect(entry?.priority).toBe(priority);
    }
  });

  it('keeps the programmatic platform and crawler pages', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/sitemap')>(
      'https://usecrawlable.com',
      '@/app/sitemap',
    );
    const urls = mod.default().map((entry) => entry.url);

    // These are the long tail the product ranks on; a sitemap rewrite that
    // drops them is a silent traffic loss.
    expect(urls).toContain('https://usecrawlable.com/platforms/nextjs');
    expect(urls).toContain('https://usecrawlable.com/ai-crawlers/gptbot');
  });

  it('never advertises a private route', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/sitemap')>(
      'https://usecrawlable.com',
      '@/app/sitemap',
    );
    const urls = mod.default().map((entry) => entry.url);

    expect(urls.some((url) => url.includes('/dashboard'))).toBe(false);
    expect(urls.some((url) => url.includes('/audit/'))).toBe(false);
  });

  it('emits no duplicate URLs', async () => {
    const mod = await loadWithOrigin<typeof import('@/app/sitemap')>(
      'https://usecrawlable.com',
      '@/app/sitemap',
    );
    const urls = mod.default().map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('plan pricing', () => {
  it('keeps the display price and the machine-readable price in step', () => {
    // The whole point of priceUsd is that structured data and the pricing
    // table cannot disagree. This is the assertion that makes that true.
    for (const plan of PLANS) {
      expect(plan.price, plan.name).toBe(`$${plan.priceUsd}`);
    }
  });
});

describe('siteSchema', () => {
  interface Graph {
    '@graph': Array<Record<string, unknown>>;
  }

  function node(type: string): Record<string, unknown> {
    const graph = siteSchema() as unknown as Graph;
    const found = graph['@graph'].find((entry) => entry['@type'] === type);
    expect(found, `no ${type} node`).toBeDefined();
    return found as Record<string, unknown>;
  }

  it('describes the organisation with a reachable logo and our real address', () => {
    const org = node('Organization');
    expect(org.name).toBe('Crawlable');
    expect(org.url).toBe('https://usecrawlable.com');
    // public/icon.png exists precisely so this URL is not a 404 — Google
    // ignores an Organization logo it cannot fetch.
    expect(org.logo).toBe('https://usecrawlable.com/icon.png');
    expect((org.contactPoint as Record<string, unknown>).email).toBe(SUPPORT_EMAIL);
  });

  it('offers exactly the plans on the pricing page, at the same prices', () => {
    const app = node('SoftwareApplication');
    const offers = app.offers as Array<Record<string, unknown>>;

    expect(offers).toHaveLength(PLANS.length);
    for (const plan of PLANS) {
      const offer = offers.find((entry) => entry.name === plan.name);
      expect(offer, plan.name).toBeDefined();
      expect(offer?.price).toBe(plan.priceUsd.toFixed(2));
      expect(offer?.priceCurrency).toBe('USD');
    }
  });

  it('marks the recurring plan with a billing period', () => {
    const app = node('SoftwareApplication');
    const offers = app.offers as Array<Record<string, unknown>>;
    const recurring = PLANS.filter((plan) => plan.recurring);

    expect(recurring.length).toBeGreaterThan(0);
    for (const plan of recurring) {
      const offer = offers.find((entry) => entry.name === plan.name);
      const spec = offer?.priceSpecification as Record<string, unknown> | undefined;
      // Without this, $29/month markup reads as a one-off $29.
      expect(spec?.unitCode, plan.name).toBe('MON');
    }
  });

  it('claims no ratings it does not have', () => {
    const app = node('SoftwareApplication');
    expect(app.aggregateRating).toBeUndefined();
    expect(app.review).toBeUndefined();
  });

  it('cannot break out of a script tag', () => {
    const serialised = serialiseJsonLd({ evil: '</script><img src=x>' });
    expect(serialised).not.toContain('</script>');
    expect(JSON.parse(serialised)).toEqual({ evil: '</script><img src=x>' });
  });
});
