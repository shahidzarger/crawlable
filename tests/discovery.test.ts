import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Discovery orchestration.
 *
 * Written after every paid audit silently crawled exactly one page for days.
 * parseSitemap worked. discoverFromHomepage worked. The orchestration passed
 * a root URL with a trailing slash where a bare origin was expected, and
 * `url.origin !== origin` was therefore true for every candidate on earth, so
 * both discovery paths returned nothing and the audit fell back to the root.
 *
 * The lesson these tests encode: unit-testing the parts is not enough when
 * the defect is in what the parts are handed. The fetcher is stubbed so this
 * runs offline and deterministically.
 */

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: 29 }, (_, i) => `  <url><loc>https://blog.example/post-${i + 1}/</loc></url>`).join('\n')}
  <url><loc>https://blog.example/about/</loc></url>
  <url><loc>https://blog.example/contact/</loc></url>
</urlset>`;

const HOMEPAGE = `<!doctype html><html><body>
  <a href="/one/">One</a>
  <a href="/two">Two</a>
  <a href="about/">Relative about</a>
  <a href="https://blog.example/three/?utm_source=nav">Three with campaign tag</a>
  <a href="https://elsewhere.example/off-site">Off site</a>
  <a href="/style.css">Stylesheet</a>
  <a href="/login">Login</a>
  <a href="mailto:hi@blog.example">Mail</a>
</body></html>`;

vi.mock('@/lib/audit/fetcher', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit/fetcher')>(
    '@/lib/audit/fetcher',
  );
  return {
    ...actual,
    tryFetch: vi.fn(),
    safeFetch: vi.fn(),
  };
});

const { tryFetch } = await import('@/lib/audit/fetcher');
const { discoverUrls, discoverFromHomepage, parseSitemap, resolveOrigin } = await import(
  '@/lib/audit/discover'
);

type Reply = { status: number; body: string; finalUrl?: string } | null;

function serve(routes: Record<string, Reply>) {
  /*
   * Keys are normalised on both sides. The real tryFetch normalises its input,
   * so discoverFromHomepage can hand it a bare origin and still reach the home
   * page; a stub matching raw strings would fail where production succeeds and
   * send the next reader hunting a bug that is not there.
   */
  const table = new Map(
    Object.entries(routes).map(([key, value]) => [new URL(key).toString(), value]),
  );

  vi.mocked(tryFetch).mockImplementation(async (target: string | URL) => {
    const url = typeof target === "string" ? target : target.toString();
    let key: string;
    try {
      key = new URL(url).toString();
    } catch {
      return null;
    }
    const reply = table.get(key) ?? null;
    if (!reply) return null;
    return {
      status: reply.status,
      body: reply.body,
      // A route may land somewhere other than where it was asked for: that is
      // what a redirect is, and it is the shape the apex-to-www bug lived in.
      finalUrl: reply.finalUrl ?? url,
      bytes: reply.body.length,
      fetchMs: 1,
      headers: { 'content-type': 'text/html' },
      redirects: [],
    } as unknown as Awaited<ReturnType<typeof tryFetch>>;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('discoverUrls', () => {
  it('seeds the queue from the sitemap up to the page limit', async () => {
    // The regression, stated as a test: a blog whose posts are in the sitemap
    // must not come back as one page.
    serve({
      'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP },
      'https://blog.example/': { status: 200, body: HOMEPAGE },
    });

    const result = await discoverUrls('https://blog.example', 40, [
      'https://blog.example/sitemap.xml',
    ]);

    expect(result.source).toBe('sitemap');
    expect(result.sitemapUrl).toBe('https://blog.example/sitemap.xml');
    expect(result.urls.length).toBeGreaterThan(1);
    expect(result.urls.length).toBe(32); // root + 31 sitemap entries
  });

  it('puts the root first and lists it once', async () => {
    serve({
      'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP },
      'https://blog.example/': { status: 200, body: HOMEPAGE },
    });

    const result = await discoverUrls('https://blog.example', 40, [
      'https://blog.example/sitemap.xml',
    ]);

    expect(result.urls[0]).toBe('https://blog.example/');
    const roots = result.urls.filter(
      (url) => url === 'https://blog.example/' || url === 'https://blog.example',
    );
    expect(roots).toHaveLength(1);
  });

  it('honours the page limit exactly', async () => {
    serve({
      'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP },
      'https://blog.example/': { status: 200, body: HOMEPAGE },
    });

    for (const limit of [1, 5, 10, 40]) {
      const result = await discoverUrls('https://blog.example', limit, [
        'https://blog.example/sitemap.xml',
      ]);
      expect(result.urls.length, `limit ${limit}`).toBeLessThanOrEqual(limit);
      if (limit > 1) expect(result.urls.length, `limit ${limit}`).toBeGreaterThan(1);
    }
  });

  it('falls back to homepage links when no sitemap exists', async () => {
    serve({ 'https://blog.example/': { status: 200, body: HOMEPAGE } });

    const result = await discoverUrls('https://blog.example', 40, []);

    expect(result.source).toBe('homepage');
    expect(result.urls.length).toBeGreaterThan(1);
    expect(result.urls).toContain('https://blog.example/one/');
    expect(result.urls).toContain('https://blog.example/two');
  });

  it('reports root-only only when discovery genuinely finds nothing', async () => {
    serve({ 'https://blog.example/': { status: 200, body: '<html></html>' } });
    const result = await discoverUrls('https://blog.example', 40, []);
    expect(result.source).toBe('root-only');
    expect(result.urls).toEqual(['https://blog.example/']);
  });

  it('works whether the caller passes a trailing slash or not', async () => {
    // Both spellings reach this function from different callers. The origin
    // comparison must not care.
    serve({
      'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP },
      'https://blog.example/': { status: 200, body: HOMEPAGE },
    });

    const bare = await discoverUrls('https://blog.example', 40, [
      'https://blog.example/sitemap.xml',
    ]);
    const slashed = await discoverUrls('https://blog.example/', 40, [
      'https://blog.example/sitemap.xml',
    ]);

    expect(slashed.urls.length).toBe(bare.urls.length);
    expect(slashed.urls.length).toBeGreaterThan(1);
  });
});

describe('discoverFromHomepage', () => {
  beforeEach(() => {
    serve({ 'https://blog.example/': { status: 200, body: HOMEPAGE } });
  });

  it('resolves relative hrefs against the page', async () => {
    const urls = await discoverFromHomepage('https://blog.example', 40);
    expect(urls).toContain('https://blog.example/one/');
    expect(urls).toContain('https://blog.example/about/');
  });

  it('strips campaign parameters rather than dropping the page', async () => {
    const urls = await discoverFromHomepage('https://blog.example', 40);
    expect(urls).toContain('https://blog.example/three/');
    expect(urls.some((url) => url.includes('utm_'))).toBe(false);
  });

  it('refuses off-origin, asset, auth and non-http links', async () => {
    const urls = await discoverFromHomepage('https://blog.example', 40);
    expect(urls.some((url) => url.includes('elsewhere.example'))).toBe(false);
    expect(urls.some((url) => url.endsWith('.css'))).toBe(false);
    expect(urls.some((url) => url.includes('/login'))).toBe(false);
    expect(urls.some((url) => url.startsWith('mailto:'))).toBe(false);
  });
});

describe('parseSitemap', () => {
  it('accepts a bare origin', async () => {
    serve({ 'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP } });
    const urls = await parseSitemap(
      'https://blog.example/sitemap.xml',
      'https://blog.example',
      100,
    );
    expect(urls.length).toBe(31);
  });

  it('accepts an origin with a trailing slash', async () => {
    serve({ 'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP } });
    const urls = await parseSitemap(
      'https://blog.example/sitemap.xml',
      'https://blog.example/',
      100,
    );
    // The exact call shape that returned zero and cost every audit 39 pages.
    expect(urls.length).toBe(31);
  });
});

describe('discovery provenance on the result', () => {
  it('counts what the sitemap offered, not just what was kept', async () => {
    /*
     * The distinction this reports is the one that cost a live debugging
     * session against a customer's own domain: a cap of 5 against a sitemap
     * of 31 is a plan limit doing its job, while a cap of 5 against a
     * discovery of 0 is a broken crawler. The report has to be able to say
     * which one a customer is looking at.
     */
    serve({
      'https://blog.example/sitemap.xml': { status: 200, body: SITEMAP },
      'https://blog.example/': { status: 200, body: HOMEPAGE },
    });

    const result = await discoverUrls('https://blog.example', 5, [
      'https://blog.example/sitemap.xml',
    ]);

    expect(result.source).toBe('sitemap');
    expect(result.urls).toHaveLength(5);
    /*
     * 15, not 31: parseSitemap reads a sampling window of limit x 3 rather
     * than the whole file, so `discovered` is "how many the source offered
     * within the window". For a real 40-page audit the window is 120, well
     * above most sitemaps, so the figure is exact where a customer sees it.
     */
    expect(result.discovered).toBe(15);
    expect(result.discovered).toBeGreaterThan(result.urls.length);
  });

  it('reports what the home page offered when there is no sitemap', async () => {
    serve({ 'https://blog.example/': { status: 200, body: HOMEPAGE } });

    const result = await discoverUrls('https://blog.example', 40);

    expect(result.source).toBe('homepage');
    expect(result.discovered).toBeGreaterThan(0);
  });

  it('reports zero discovered when nothing was found', async () => {
    // Root-only with discovered: 0 is the signature of the bug these tests
    // exist for. It must stay distinguishable from a small site.
    serve({});

    const result = await discoverUrls('https://blog.example', 40);

    expect(result.source).toBe('root-only');
    expect(result.discovered).toBe(0);
    expect(result.urls).toHaveLength(1);
  });
});

/**
 * The apex-to-www defect, found on century.ae.
 *
 * The site's apex redirects to www. The typed origin was used for every
 * same-origin comparison, and `URL.origin` folds in the www label — so all
 * 116 homepage links and all 120 sitemap entries resolved to
 * `https://www.century.ae` and were discarded as cross-origin. Discovery
 * returned nothing, `source` was 'root-only', and a site with hundreds of
 * pages was audited as one. Every assertion here failed before the fix.
 */
describe('apex that redirects to www', () => {
  const WWW_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.century.test/</loc></url>
  <url><loc>https://www.century.test/en/about-us/</loc></url>
  <url><loc>https://www.century.test/en/why-us/</loc></url>
  <url><loc>https://www.century.test/en/research/</loc></url>
</urlset>`;

  const WWW_HOMEPAGE = `<!doctype html><html><body>
    <a href="/en/">Home</a>
    <a href="/en/about-us/">About</a>
    <a href="https://www.century.test/en/careers/">Careers</a>
    <a href="https://other.test/off">Off site</a>
  </body></html>`;

  it('finds the sitemap pages even though they are on the www host', async () => {
    serve({
      'https://www.century.test/sitemap.xml': { status: 200, body: WWW_SITEMAP },
      'https://century.test/': {
        status: 200,
        body: WWW_HOMEPAGE,
        finalUrl: 'https://www.century.test/en/',
      },
    });

    const result = await discoverUrls('https://century.test', 40, [
      'https://www.century.test/sitemap.xml',
    ]);

    expect(result.source).toBe('sitemap');
    expect(result.urls.length).toBeGreaterThan(1);
    expect(result.urls).toContain('https://www.century.test/en/about-us/');
  });

  it('falls back to www homepage links when there is no sitemap', async () => {
    serve({
      'https://century.test/': {
        status: 200,
        body: WWW_HOMEPAGE,
        finalUrl: 'https://www.century.test/en/',
      },
    });

    const result = await discoverUrls('https://century.test', 40);

    expect(result.source).toBe('homepage');
    expect(result.urls).toContain('https://www.century.test/en/about-us/');
    expect(result.urls).toContain('https://www.century.test/en/careers/');
    // Still scoped: a genuinely different host is not crawled.
    expect(result.urls.some((u) => u.includes('other.test'))).toBe(false);
  });

  it('resolveOrigin reports where the entry URL actually landed', async () => {
    serve({
      'https://century.test/': {
        status: 200,
        body: WWW_HOMEPAGE,
        finalUrl: 'https://www.century.test/en/',
      },
    });

    const resolved = await resolveOrigin('https://century.test');

    expect(resolved.origin).toBe('https://www.century.test');
    expect(resolved.entryUrl).toBe('https://www.century.test/en/');
    expect(resolved.redirectedFrom).toBe('https://century.test');
    // Same site, so no off-site warning: www is not somewhere else.
    expect(resolved.offSite).toBe(false);
  });

  it('flags a redirect that leaves the site, but still follows it', async () => {
    serve({
      'https://moved.test/': {
        status: 200,
        body: WWW_HOMEPAGE,
        finalUrl: 'https://newbrand.test/home/',
      },
    });

    const resolved = await resolveOrigin('https://moved.test');

    expect(resolved.origin).toBe('https://newbrand.test');
    expect(resolved.offSite).toBe(true);
  });

  it('keeps the typed origin when the root does not respond', async () => {
    serve({});

    const resolved = await resolveOrigin('https://unreachable.test');

    expect(resolved.origin).toBe('https://unreachable.test');
    expect(resolved.entryUrl).toBe('https://unreachable.test/');
    expect(resolved.redirectedFrom).toBeNull();
  });
});
