import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blogMdxComponents } from '@/components/blog/mdx-components';
import { compilePost } from '@/lib/blog/compile';
import { loadPosts } from '@/lib/blog/posts';
import { PLATFORMS } from '@/content/platforms';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';

/**
 * Guards on the real posts in content/blog.
 *
 * `next build` would also fail on a broken post, but only after a minute of
 * compiling everything else, and with a stack trace rather than a file name.
 * These run the same compile path in seconds and say which post is wrong.
 */

const posts = loadPosts();

/** Every internal path the site can serve, for link checking. */
const KNOWN_PATHS = new Set<string>([
  '/',
  '/blog',
  '/llms.txt',
  '/feed.xml',
  '/sitemap.xml',
  '/robots.txt',
  '/ai-crawlers',
  '/platforms',
  ...posts.map((post) => `/blog/${post.slug}`),
  ...PLATFORMS.map((platform) => `/platforms/${platform.slug}`),
  ...AI_CRAWLERS.map((crawler) => `/ai-crawlers/${crawler.token.toLowerCase()}`),
]);

describe('blog content', () => {
  it('has the five launch posts, all published', () => {
    expect(posts.map((post) => post.slug).sort()).toEqual([
      'google-seo-vs-ai-search-optimization',
      'how-to-create-llms-txt',
      'robots-txt-for-ai-crawlers',
      'what-is-generative-engine-optimization',
      'why-ai-search-engines-cant-read-client-side-rendered-sites',
    ]);
    expect(posts.every((post) => !post.draft)).toBe(true);
  });

  it('gives every post a unique title and description', () => {
    expect(new Set(posts.map((post) => post.title)).size).toBe(posts.length);
    expect(new Set(posts.map((post) => post.description)).size).toBe(posts.length);
  });

  describe.each(posts.map((post) => [post.slug, post] as const))('%s', (_slug, post) => {
    it('compiles, renders, and its table of contents matches its headings', async () => {
      const { Content, toc } = await compilePost(post.body, `${post.slug}.mdx`);
      const html = renderToStaticMarkup(createElement(Content, { components: blogMdxComponents }));

      expect(toc.length, 'a long-form post should have sections').toBeGreaterThanOrEqual(4);
      for (const entry of toc) {
        // Every ToC link must land on a real element id in the rendered HTML.
        expect(html).toContain(`id="${entry.id}"`);
      }
      expect(html).not.toMatch(/<h1[\s>]/);
    });

    it('has an inline call to action that renders a link to the scanner', async () => {
      expect(post.body).toMatch(/<AuditCta\s*\/>/);
      const { Content } = await compilePost(post.body, `${post.slug}.mdx`);
      const html = renderToStaticMarkup(createElement(Content, { components: blogMdxComponents }));
      expect(html).toContain('href="/#scan"');
    });

    it('only links to internal pages that exist', () => {
      // Code (fenced and inline) holds illustrative links, not real ones.
      const prose = post.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      const internal = [...prose.matchAll(/\]\((\/[^)\s#?]*)/g)].map((match) => match[1]!);
      for (const href of internal) {
        expect(KNOWN_PATHS.has(href), `${post.slug} links to missing page ${href}`).toBe(true);
      }
    });

    it('links its external claims to https sources', () => {
      const external = [...post.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]!);
      expect(external.length, 'a factual post should cite sources').toBeGreaterThanOrEqual(3);
      for (const href of external) {
        // example.com / acme.example are illustrative and allowed.
        if (/\b(example\.com|acme\.example)\b/.test(href)) continue;
        expect(href.startsWith('https://'), href).toBe(true);
      }
    });

    it('does not hard-code crawler counts the registry owns', () => {
      // "13 of 15 AI crawlers" in prose goes stale the day the registry
      // changes; posts must use <CrawlerCount /> instead.
      const prose = post.body.replace(/```[\s\S]*?```/g, '');
      expect(prose).not.toMatch(/\b\d+\s+(of the\s+)?\d+\s+AI\s+(crawlers|user agents)\b/i);
    });
  });
});
