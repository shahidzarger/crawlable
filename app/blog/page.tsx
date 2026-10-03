import type { Metadata } from 'next';
import { BlogIndex, type IndexPost } from '@/components/blog/BlogIndex';
import { formatDate, getAllTags, getPostSummaries } from '@/lib/blog/posts';
import { BLOG_DESCRIPTION, BLOG_TITLE, breadcrumbJsonLd, canonicalUrl } from '@/lib/blog/seo';
import { serialiseJsonLd } from '@/lib/seo/schema';
import { PRODUCTION_ORIGIN, SITE_URL } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Blog: AI search visibility, llms.txt and AI crawlers',
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': [{ url: '/feed.xml', title: BLOG_TITLE }] },
  },
  openGraph: {
    type: 'website',
    url: '/blog',
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: BLOG_TITLE, description: BLOG_DESCRIPTION },
};

export default function BlogPage() {
  const summaries = getPostSummaries();
  const posts: IndexPost[] = summaries.map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    tags: post.tags,
    readingMinutes: post.readingMinutes,
    date: post.date,
    displayDate: formatDate(post.date),
  }));

  /*
   * A Blog node listing its posts, plus breadcrumbs. The posts are referenced
   * by the same @id their own Article markup declares, so search engines can
   * join the listing to the articles instead of seeing two sets of entities.
   */
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${PRODUCTION_ORIGIN}/blog#blog`,
    name: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    url: `${SITE_URL}/blog`,
    publisher: { '@id': `${PRODUCTION_ORIGIN}/#organization` },
    blogPost: summaries.map((post) => ({
      '@type': 'Article',
      '@id': `${canonicalUrl(post, SITE_URL)}#article`,
      headline: post.title,
      url: canonicalUrl(post, SITE_URL),
      datePublished: `${post.date}T00:00:00Z`,
    })),
  };
  const crumbs = breadcrumbJsonLd(
    [
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
    ],
    SITE_URL,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiseJsonLd(blogLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiseJsonLd(crumbs) }} />

      <header className="max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">Blog</h1>
        <p className="mt-4 text-lg leading-relaxed ink-secondary">{BLOG_DESCRIPTION}</p>
        <p className="mt-3 text-sm ink-muted">
          <a href="/feed.xml" className="underline underline-offset-2 hover:text-[var(--ink-secondary)]">
            Subscribe via RSS
          </a>
        </p>
      </header>

      <div className="mt-10">
        <BlogIndex posts={posts} tags={getAllTags(summaries)} />
      </div>
    </div>
  );
}
