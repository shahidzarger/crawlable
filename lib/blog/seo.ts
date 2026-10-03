import { PRODUCTION_ORIGIN } from '@/lib/site-url';
import type { PostSummary } from './posts';

/**
 * Structured data, canonical URLs and the RSS feed for the blog.
 *
 * Kept free of React and Next so each piece can be asserted directly in tests:
 * these are the outputs that only ever break in public, where nobody notices
 * until a rich result disappears or a feed reader shows raw ampersands.
 */

/** Matches the Organization node emitted site-wide by lib/seo/schema.ts. */
const ORGANIZATION_ID = `${PRODUCTION_ORIGIN}/#organization`;

export const BLOG_TITLE = 'Crawlable Blog';
export const BLOG_DESCRIPTION =
  'Practical guides to AI search visibility: how AI crawlers read your site, llms.txt, robots.txt for AI bots, and generative engine optimization.';

export function postPath(slug: string): string {
  return `/blog/${slug}`;
}

/**
 * The canonical URL for a post, absolute.
 *
 * A frontmatter `canonical` wins — that is how a post cross-published from
 * elsewhere points search engines at the original. A relative one is resolved
 * against `origin`, so authors can write "/blog/other-post" in frontmatter.
 */
export function canonicalUrl(post: Pick<PostSummary, 'slug' | 'canonical'>, origin: string): string {
  const target = post.canonical ?? postPath(post.slug);
  return new URL(target, `${origin}/`).toString();
}

/** The share image: the frontmatter `ogImage`, else the generated card. */
export function ogImagePath(post: Pick<PostSummary, 'slug' | 'ogImage'>): string {
  return post.ogImage ?? `/og/blog/${post.slug}`;
}

/**
 * The author as a schema.org node.
 *
 * "Crawlable" is the publisher itself, so it is referenced by @id rather than
 * restated as a Person — a Person named after a company is an entity error
 * that Google's Rich Results Test flags.
 */
function authorNode(author: string): Record<string, unknown> {
  if (author.trim().toLowerCase() === 'crawlable') return { '@id': ORGANIZATION_ID };
  return { '@type': 'Person', name: author };
}

export function articleJsonLd(post: PostSummary, origin: string): Record<string, unknown> {
  const url = canonicalUrl(post, origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: [new URL(ogImagePath(post), `${origin}/`).toString()],
    // Dates as full ISO timestamps: Google accepts bare dates but warns that
    // without a timezone it has to guess one.
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: `${post.lastModified}T00:00:00Z`,
    author: authorNode(post.author),
    publisher: { '@id': ORGANIZATION_ID },
    keywords: post.tags.join(', '),
    inLanguage: 'en-US',
    isPartOf: { '@id': `${PRODUCTION_ORIGIN}/#website` },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[], origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.path, `${origin}/`).toString(),
    })),
  };
}

export function postCrumbs(post: Pick<PostSummary, 'slug' | 'title'>): Crumb[] {
  return [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: post.title, path: postPath(post.slug) },
  ];
}

/** Escape the five XML special characters. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * RSS 2.0 feed.
 *
 * RSS rather than Atom because it is what every reader and most aggregators
 * expect at /feed.xml. The atom:link self reference is included because the
 * W3C feed validator warns without it, and some readers use it to dedupe.
 *
 * <link> and <guid> use each post's own URL under `origin` — not a
 * cross-post canonical — because the feed advertises this site's copy.
 */
export function buildRss(posts: readonly PostSummary[], origin: string): string {
  const latest = posts.reduce<string | null>(
    (max, post) => (max === null || post.lastModified > max ? post.lastModified : max),
    null,
  );

  const items = posts.map((post) => {
    const link = new URL(postPath(post.slug), `${origin}/`).toString();
    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(post.description)}</description>`,
      `      <dc:creator>${escapeXml(post.author)}</dc:creator>`,
      ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      '    </item>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(BLOG_TITLE)}</title>`,
    `    <link>${escapeXml(`${origin}/blog`)}</link>`,
    `    <description>${escapeXml(BLOG_DESCRIPTION)}</description>`,
    '    <language>en-us</language>',
    `    <atom:link href="${escapeXml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    ...(latest ? [`    <lastBuildDate>${new Date(`${latest}T00:00:00Z`).toUTCString()}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
