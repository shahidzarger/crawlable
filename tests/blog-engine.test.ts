import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseFrontmatter } from '@/lib/blog/frontmatter';
import { compilePost } from '@/lib/blog/compile';
import { loadPosts, parsePost, readingMinutes, type PostSummary } from '@/lib/blog/posts';
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildRss,
  canonicalUrl,
  ogImagePath,
  postCrumbs,
} from '@/lib/blog/seo';
import { matchesQuery, type IndexPost } from '@/components/blog/BlogIndex';
import { robotsTemplate } from '@/components/blog/mdx-components';
import { AI_CRAWLERS, VISIBILITY_CRITICAL_CRAWLERS } from '@/lib/audit/crawlers';

/**
 * The blog engine: frontmatter validation, the heading/ToC pass, structured
 * data, the feed and the sitemap. Each of these fails in public rather than
 * in a build — an "Invalid Date" in Article markup, a ToC link to nowhere, a
 * raw ampersand that makes a feed reader reject the whole file.
 */

const VALID = {
  title: 'A perfectly reasonable title',
  description: 'A description that is long enough to be a real meta description for a post.',
  date: '2026-10-03',
  author: 'Crawlable',
  tags: ['geo'],
};

function source(front: Record<string, unknown>, body = '## One\n\nText.\n'): string {
  const yaml = Object.entries(front)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : String(value)}`)
    .join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

describe('frontmatter', () => {
  it('normalises an unquoted YAML date (parsed as a Date) to YYYY-MM-DD', () => {
    // gray-matter turns `date: 2026-10-03` into a JS Date. Without the
    // preprocess step this post would fail validation — or worse, be
    // stringified to "Sat Oct 03 2026 …" in JSON-LD.
    const post = parsePost('a-post', source(VALID));
    expect(post.date).toBe('2026-10-03');
    expect(post.lastModified).toBe('2026-10-03');
  });

  it('accepts a quoted date identically', () => {
    const post = parsePost('a-post', source({ ...VALID, date: '"2026-10-03"' }));
    expect(post.date).toBe('2026-10-03');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => parseFrontmatter({ ...VALID, date: '2026-02-30' }, 'x.mdx')).toThrow(/calendar date/);
  });

  it('rejects `updated` earlier than `date`', () => {
    expect(() => parseFrontmatter({ ...VALID, updated: '2026-01-01' }, 'x.mdx')).toThrow(/updated/);
  });

  it('rejects a bare string for tags instead of silently wrapping it', () => {
    expect(() => parseFrontmatter({ ...VALID, tags: 'geo' }, 'x.mdx')).toThrow(/tags/);
  });

  it('rejects unknown keys, so a typo like "descripton" is caught', () => {
    expect(() => parseFrontmatter({ ...VALID, descripton: 'oops' }, 'x.mdx')).toThrow();
  });

  it('names the file in the error', () => {
    expect(() => parseFrontmatter({ ...VALID, title: 'short' }, 'bad-post.mdx')).toThrow(/bad-post\.mdx/);
  });

  it('accepts a relative or absolute canonical but not a protocol-relative one', () => {
    expect(parseFrontmatter({ ...VALID, canonical: '/blog/x' }, 'x.mdx').canonical).toBe('/blog/x');
    expect(parseFrontmatter({ ...VALID, canonical: 'https://dev.to/x' }, 'x.mdx').canonical).toBe('https://dev.to/x');
    expect(() => parseFrontmatter({ ...VALID, canonical: '//evil.example/x' }, 'x.mdx')).toThrow();
    expect(() => parseFrontmatter({ ...VALID, canonical: 'javascript:alert(1)' }, 'x.mdx')).toThrow();
  });

  it('rejects file names that are not clean slugs', () => {
    expect(() => parsePost('My Post', source(VALID))).toThrow(/file name/);
  });
});

describe('loading posts from disk', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sorts newest first and keeps drafts out of nothing but the published list', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
    fs.writeFileSync(path.join(dir, 'older.mdx'), source({ ...VALID, date: '2026-01-01' }));
    fs.writeFileSync(path.join(dir, 'newer.mdx'), source({ ...VALID, date: '2026-05-01' }));
    fs.writeFileSync(path.join(dir, 'draft.mdx'), source({ ...VALID, draft: true }));
    const posts = loadPosts(dir);
    expect(posts.map((post) => post.slug)).toEqual(['draft', 'newer', 'older']);
    expect(posts.find((post) => post.slug === 'draft')?.draft).toBe(true);
  });

  it('refuses two files that claim the same slug', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
    fs.writeFileSync(path.join(dir, 'same.md'), source(VALID));
    fs.writeFileSync(path.join(dir, 'same.mdx'), source(VALID));
    expect(() => loadPosts(dir)).toThrow(/same/);
  });
});

describe('reading time', () => {
  it('counts prose but not code blocks', () => {
    const prose = Array.from({ length: 460 }, () => 'word').join(' ');
    const code = '```\n' + Array.from({ length: 5000 }, () => 'token').join(' ') + '\n```';
    expect(readingMinutes(prose)).toBe(2);
    expect(readingMinutes(`${prose}\n\n${code}`)).toBe(2);
  });

  it('is never zero', () => {
    expect(readingMinutes('Hi.')).toBe(1);
  });
});

describe('headings and table of contents', () => {
  it('gives duplicate headings distinct ids that the ToC links to', async () => {
    const { Content, toc } = await compilePost('## Setup\n\nA\n\n### Setup\n\nB\n\n## Setup\n\nC\n');
    expect(toc.map((entry) => entry.id)).toEqual(['setup', 'setup-1', 'setup-2']);
    const html = renderToStaticMarkup(createElement(Content));
    expect(html).toContain('<h2 id="setup">');
    expect(html).toContain('<h3 id="setup-1">');
    expect(html).toContain('<h2 id="setup-2">');
  });

  it('includes inline code in heading text and ids', async () => {
    const { toc } = await compilePost('## Put `llms.txt` at the root\n');
    expect(toc[0]).toEqual({ depth: 2, text: 'Put llms.txt at the root', id: 'put-llmstxt-at-the-root' });
  });

  it('rejects an h1 in the body', async () => {
    await expect(compilePost('# Second title\n')).rejects.toThrow(/h1/);
  });

  it('reports MDX syntax errors with the file name', async () => {
    await expect(compilePost('A stray <div in prose\n', 'broken.mdx')).rejects.toThrow(/broken\.mdx/);
  });
});

const POST: PostSummary = {
  slug: 'a-post',
  title: 'Ampersands & <angle> brackets',
  description: 'A description that is long enough to be a real meta description for a post.',
  date: '2026-10-03',
  updated: '2026-10-10',
  lastModified: '2026-10-10',
  author: 'Crawlable',
  tags: ['geo', 'llms-txt'],
  readingMinutes: 4,
  draft: false,
};

describe('structured data', () => {
  const ORIGIN = 'https://usecrawlable.com';

  it('emits an Article with absolute URLs, timezone-qualified dates and the site publisher', () => {
    const ld = articleJsonLd(POST, ORIGIN);
    expect(ld['@type']).toBe('Article');
    expect(ld.url).toBe('https://usecrawlable.com/blog/a-post');
    expect(ld.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': 'https://usecrawlable.com/blog/a-post' });
    expect(ld.datePublished).toBe('2026-10-03T00:00:00Z');
    expect(ld.dateModified).toBe('2026-10-10T00:00:00Z');
    expect(ld.image).toEqual(['https://usecrawlable.com/og/blog/a-post']);
    expect(ld.publisher).toEqual({ '@id': 'https://usecrawlable.com/#organization' });
    // The company as author is the Organization node, not a Person named "Crawlable".
    expect(ld.author).toEqual({ '@id': 'https://usecrawlable.com/#organization' });
  });

  it('makes a named author a Person', () => {
    expect(articleJsonLd({ ...POST, author: 'Jane Doe' }, ORIGIN).author).toEqual({ '@type': 'Person', name: 'Jane Doe' });
  });

  it('honours frontmatter canonical and ogImage overrides', () => {
    const crossPost = { ...POST, canonical: 'https://dev.to/crawlable/a-post', ogImage: '/images/custom.png' };
    expect(canonicalUrl(crossPost, ORIGIN)).toBe('https://dev.to/crawlable/a-post');
    expect(canonicalUrl({ ...POST, canonical: '/blog/other' }, ORIGIN)).toBe('https://usecrawlable.com/blog/other');
    expect(ogImagePath(crossPost)).toBe('/images/custom.png');
    expect(articleJsonLd(crossPost, ORIGIN).image).toEqual(['https://usecrawlable.com/images/custom.png']);
  });

  it('builds Home > Blog > Post breadcrumbs with 1-based positions', () => {
    const ld = breadcrumbJsonLd(postCrumbs(POST), ORIGIN);
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((item) => [item.position, item.name, item.item])).toEqual([
      [1, 'Home', 'https://usecrawlable.com/'],
      [2, 'Blog', 'https://usecrawlable.com/blog'],
      [3, POST.title, 'https://usecrawlable.com/blog/a-post'],
    ]);
  });
});

describe('RSS feed', () => {
  const xml = buildRss([POST], 'https://usecrawlable.com');

  it('escapes XML special characters in titles', () => {
    expect(xml).toContain('<title>Ampersands &amp; &lt;angle&gt; brackets</title>');
    expect(xml).not.toContain('Ampersands & <angle>');
  });

  // Well-formedness is checked with a real XML parser in blog-feed-xml.test.ts.

  it('has a self link, RFC 822 dates and a permalink guid', () => {
    expect(xml).toContain('<atom:link href="https://usecrawlable.com/feed.xml" rel="self"');
    expect(xml).toContain('<pubDate>Sat, 03 Oct 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<lastBuildDate>Sat, 10 Oct 2026 00:00:00 GMT</lastBuildDate>');
    expect(xml).toContain('<guid isPermaLink="true">https://usecrawlable.com/blog/a-post</guid>');
  });
});

describe('index search', () => {
  const post: IndexPost = { ...POST, displayDate: 'October 3, 2026' };

  it('matches every word anywhere in title, description or tags, case-insensitively', () => {
    expect(matchesQuery(post, '')).toBe(true);
    expect(matchesQuery(post, 'AMPERSANDS llms-txt')).toBe(true);
    expect(matchesQuery(post, 'ampersands kubernetes')).toBe(false);
  });
});

describe('robots.txt template used in the posts', () => {
  const template = robotsTemplate(['/admin/']);
  const groups = template.split(/\n\s*\n/);

  it('allows every visibility-critical crawler and disallows every training crawler', () => {
    const allowGroup = groups.find((group) => group.includes('Allow: /') && group.includes('OAI-SearchBot'))!;
    const blockGroup = groups.find((group) => /^Disallow: \/$/m.test(group))!;
    for (const crawler of VISIBILITY_CRITICAL_CRAWLERS) {
      expect(allowGroup).toContain(`User-agent: ${crawler.token}\n`);
      expect(blockGroup).not.toContain(`User-agent: ${crawler.token}\n`);
    }
    for (const crawler of AI_CRAWLERS.filter((c) => !c.blockingCostsVisibility)) {
      expect(blockGroup).toContain(`User-agent: ${crawler.token}\n`);
    }
  });

  it('repeats the private paths in every allow group, because named groups ignore *', () => {
    for (const group of groups.filter((g) => /^Allow: \/$/m.test(g))) {
      expect(group).toContain('Disallow: /admin/');
    }
  });
});

describe('sitemap, feed route and llms.txt include the blog', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function withOrigin<T>(modulePath: string): Promise<T> {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://usecrawlable.com');
    vi.resetModules();
    return (await import(modulePath)) as T;
  }

  it('lists /blog and every post, dated by the post rather than the build', async () => {
    // Pin "now" far from any post date; otherwise a post published on the
    // day of the build would pass even if the sitemap used the build time.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    const { default: sitemap } = await withOrigin<typeof import('@/app/sitemap')>('@/app/sitemap');
    const entries = sitemap();
    vi.useRealTimers();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain('https://usecrawlable.com/blog');

    for (const post of loadPosts().filter((p) => !p.draft)) {
      const entry = entries.find((e) => e.url === `https://usecrawlable.com/blog/${post.slug}`);
      expect(entry, post.slug).toBeDefined();
      expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(post.lastModified);
    }
  });

  it('serves the feed as RSS with every post', async () => {
    const { GET } = await withOrigin<typeof import('@/app/feed.xml/route')>('@/app/feed.xml/route');
    const response = GET();
    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
    const body = await response.text();
    for (const post of loadPosts().filter((p) => !p.draft)) {
      expect(body).toContain(`<link>https://usecrawlable.com/blog/${post.slug}</link>`);
    }
  });

  it('adds the posts to llms.txt', async () => {
    const { GET } = await withOrigin<typeof import('@/app/llms.txt/route')>('@/app/llms.txt/route');
    const body = await GET().text();
    expect(body).toContain('## Guides');
    for (const post of loadPosts().filter((p) => !p.draft)) {
      expect(body).toContain(`(https://usecrawlable.com/blog/${post.slug})`);
    }
  });
});
