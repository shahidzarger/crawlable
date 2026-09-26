import { describe, expect, it } from 'vitest';
import {
  canonicalKey,
  dedupeByUrl,
  dedupeUrls,
  normaliseForCrawl,
  safeCanonicalKey,
} from '@/lib/audit/url';
import { checkMetadata } from '@/lib/audit/scoring';
import type { PageAnalysis } from '@/lib/audit/types';

describe('normaliseForCrawl', () => {
  it('drops the fragment', () => {
    expect(normaliseForCrawl('https://example.com/blog#section')).toBe(
      'https://example.com/blog',
    );
  });

  it('strips campaign and click identifiers', () => {
    expect(
      normaliseForCrawl(
        'https://example.com/post?utm_source=x&utm_medium=email&utm_campaign=launch',
      ),
    ).toBe('https://example.com/post');
    expect(normaliseForCrawl('https://example.com/p?fbclid=abc&gclid=def')).toBe(
      'https://example.com/p',
    );
    expect(normaliseForCrawl('https://example.com/p?ref=producthunt')).toBe(
      'https://example.com/p',
    );
  });

  it('keeps parameters the server may route on', () => {
    // The failure mode this guards is silent and expensive: strip a routing
    // parameter and the crawler reports on a different page than the one the
    // customer has.
    for (const url of [
      'https://example.com/search?q=ai',
      'https://example.com/posts?page=3',
      'https://example.com/item?id=77',
      'https://example.com/docs?lang=fr',
      'https://example.com/?source=partner',
    ]) {
      expect(normaliseForCrawl(url), url).toBe(url);
    }
  });

  it('removes tracking noise without losing the real parameters beside it', () => {
    expect(normaliseForCrawl('https://example.com/s?q=ai&utm_source=news&page=2')).toBe(
      'https://example.com/s?page=2&q=ai',
    );
  });

  it('orders parameters so one page is one string', () => {
    const a = normaliseForCrawl('https://example.com/s?b=2&a=1');
    const b = normaliseForCrawl('https://example.com/s?a=1&b=2');
    expect(a).toBe(b);
  });

  it('leaves the trailing slash alone, so no crawl pays for a redirect', () => {
    // Deliberate. Collapsing it here would 301 every page on a site built
    // with trailingSlash: true; the collapse belongs in canonicalKey.
    expect(normaliseForCrawl('https://example.com/blog/')).toBe(
      'https://example.com/blog/',
    );
  });

  it('lowercases the host but never the path', () => {
    expect(normaliseForCrawl('https://EXAMPLE.com/Blog')).toBe(
      'https://example.com/Blog',
    );
  });

  it('drops a default port', () => {
    expect(normaliseForCrawl('https://example.com:443/blog')).toBe(
      'https://example.com/blog',
    );
  });
});

describe('canonicalKey', () => {
  it('collapses the spellings that describe one page', () => {
    const forms = [
      'https://example.com/blog',
      'https://example.com/blog/',
      'https://example.com/blog#top',
      'https://example.com/blog/?utm_source=twitter',
      'https://EXAMPLE.com/blog/',
      'https://example.com:443/blog',
    ];
    const keys = new Set(forms.map((form) => canonicalKey(form)));
    expect(keys.size, [...keys].join(' | ')).toBe(1);
  });

  it('treats the bare origin and the root slash as the same page', () => {
    expect(canonicalKey('https://example.com')).toBe(canonicalKey('https://example.com/'));
  });

  it('keeps the root slash rather than producing a bare origin', () => {
    expect(canonicalKey('https://example.com/')).toBe('https://example.com/');
  });

  it('keeps genuinely different pages apart', () => {
    const keys = [
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/a/b',
      'https://shop.example.com/a',
      'http://example.com/a',
      'https://example.com/search?q=one',
      'https://example.com/search?q=two',
    ].map((url) => canonicalKey(url));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('collapses repeated trailing slashes', () => {
    expect(canonicalKey('https://example.com/blog///')).toBe('https://example.com/blog');
  });

  it('reports malformed input instead of throwing', () => {
    expect(safeCanonicalKey('not a url')).toBeNull();
  });
});

describe('dedupeUrls', () => {
  it('keeps the first spelling of each page', () => {
    const out = dedupeUrls([
      'https://example.com/',
      'https://example.com/blog/',
      'https://example.com/blog',
      'https://example.com/blog/?utm_source=x',
      'https://example.com/about',
    ]);
    expect(out).toEqual([
      'https://example.com/',
      'https://example.com/blog/',
      'https://example.com/about',
    ]);
  });

  it('preserves index 0, which the crawler relies on', () => {
    // The entry URL is placed first so it is fetched first and is the last
    // thing a budget overrun drops.
    const out = dedupeUrls([
      'https://example.com/pricing',
      'https://example.com/',
      'https://example.com/pricing/',
    ]);
    expect(out[0]).toBe('https://example.com/pricing');
  });

  it('is the fix for the double-counted home page', () => {
    // normaliseUrl('example.com').toString() gives the slash form; discovery
    // used to yield the bare origin. A plain includes() check missed the
    // match and queued the home page twice.
    const entry = 'https://example.com/';
    const discovered = ['https://example.com', 'https://example.com/about'];
    expect(dedupeUrls([entry, ...discovered])).toEqual([
      'https://example.com/',
      'https://example.com/about',
    ]);
  });

  it('drops entries it cannot key rather than trusting them', () => {
    expect(dedupeUrls(['https://example.com/a', 'javascript:void(0)', ''])).toEqual([
      'https://example.com/a',
    ]);
  });
});

describe('dedupeByUrl', () => {
  it('collapses pages that redirected to the same place', () => {
    const pages = [
      { url: 'https://example.com/home', title: 'Home' },
      { url: 'https://example.com/', title: 'Home' },
      { url: 'https://example.com/about', title: 'About' },
    ];
    // /home is a distinct key from /, so this only collapses once the fetcher
    // has rewritten both to the post-redirect URL.
    const redirected = pages.map((page) =>
      page.url === 'https://example.com/home' ? { ...page, url: 'https://example.com/' } : page,
    );
    expect(dedupeByUrl(redirected, (page) => page.url)).toHaveLength(2);
  });

  it('keeps a page whose URL cannot be keyed, rather than losing real data', () => {
    const items = [{ url: 'not a url' }, { url: 'https://example.com/a' }];
    expect(dedupeByUrl(items, (item) => item.url)).toHaveLength(2);
  });
});

/** Minimal readable page for the metadata check. */
function page(url: string, title: string): PageAnalysis {
  return {
    url,
    status: 200,
    title,
    metaDescription: 'A description.',
    noindex: false,
    error: null,
  } as unknown as PageAnalysis;
}

describe('duplicate-title check', () => {
  function finding(pages: PageAnalysis[]) {
    return checkMetadata(pages).findings.find((f) => f.id === 'duplicate-titles');
  }

  it('does not flag one path indexed under two slash variants', () => {
    // The regression this exists for: a paid report telling a customer their
    // pricing page duplicates their pricing page.
    expect(
      finding([
        page('https://example.com/pricing', 'Pricing'),
        page('https://example.com/pricing/', 'Pricing'),
      ]),
    ).toBeUndefined();
  });

  it('does not flag a path against its own tracking-parameter variant', () => {
    expect(
      finding([
        page('https://example.com/blog', 'Blog'),
        page('https://example.com/blog?utm_source=x', 'Blog'),
      ]),
    ).toBeUndefined();
  });

  it('still flags two genuinely different pages sharing a title', () => {
    const result = finding([
      page('https://example.com/a', 'Untitled'),
      page('https://example.com/b', 'Untitled'),
    ]);
    expect(result).toBeDefined();
    expect(result?.affectedCount).toBe(2);
  });

  it('does not spend the duplicate-title penalty on an alias pair', () => {
    const aliases = checkMetadata([
      page('https://example.com/pricing', 'Pricing'),
      page('https://example.com/pricing/', 'Pricing'),
    ]);
    const genuine = checkMetadata([
      page('https://example.com/a', 'Same'),
      page('https://example.com/b', 'Same'),
    ]);
    expect(aliases.score).toBeGreaterThan(genuine.score);
  });
});
