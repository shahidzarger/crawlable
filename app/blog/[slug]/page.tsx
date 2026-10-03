import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AuditCta } from '@/components/blog/AuditCta';
import { TableOfContents } from '@/components/blog/TableOfContents';
import { blogMdxComponents } from '@/components/blog/mdx-components';
import { compilePost } from '@/lib/blog/compile';
import { formatDate, getAllPosts, getPost, relatedPosts } from '@/lib/blog/posts';
import {
  BLOG_TITLE,
  articleJsonLd,
  breadcrumbJsonLd,
  canonicalUrl,
  ogImagePath,
  postCrumbs,
} from '@/lib/blog/seo';
import { serialiseJsonLd } from '@/lib/seo/schema';
import { SITE_URL } from '@/lib/site-url';

/**
 * One statically generated page per post.
 *
 * dynamicParams is off: every post is known at build time, so an unknown slug
 * is a 404 from the CDN rather than a server render that reads the
 * filesystem at request time (where content/ may not even be deployed).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: 'Post not found' };

  const canonical = canonicalUrl(post, SITE_URL);
  const image = { url: ogImagePath(post), width: 1200, height: 630, alt: post.title };

  return {
    /*
     * Absolute rather than the site template: the template's long suffix
     * pushes a typical post title past 100 characters, and search results
     * truncate at roughly 60. The post title is the part worth showing.
     */
    title: { absolute: `${post.title} | Crawlable` },
    description: post.description,
    authors: [{ name: post.author }],
    keywords: post.tags,
    alternates: {
      canonical,
      types: { 'application/rss+xml': [{ url: '/feed.xml', title: BLOG_TITLE }] },
    },
    openGraph: {
      type: 'article',
      url: canonical,
      title: post.title,
      description: post.description,
      siteName: 'Crawlable',
      publishedTime: `${post.date}T00:00:00Z`,
      modifiedTime: `${post.lastModified}T00:00:00Z`,
      authors: [post.author],
      tags: post.tags,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [image.url],
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { Content, toc } = await compilePost(post.body, `${post.slug}.mdx`);
  const related = relatedPosts(post);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(articleJsonLd(post, SITE_URL)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(breadcrumbJsonLd(postCrumbs(post), SITE_URL)) }}
      />

      <nav aria-label="Breadcrumb" className="text-xs ink-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-[var(--ink-secondary)]">Home</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/blog" className="hover:text-[var(--ink-secondary)]">Blog</Link>
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="min-w-0">
          <header className="max-w-[68ch]">
            <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.03em] sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed ink-secondary">{post.description}</p>
            <p className="mt-5 text-sm ink-muted">
              By {post.author} · <time dateTime={post.date}>{formatDate(post.date)}</time>
              {post.updated && post.updated !== post.date ? (
                <>
                  {' '}· Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
                </>
              ) : null}{' '}
              · {post.readingMinutes} min read
            </p>
          </header>

          {/* Small screens: the contents collapse above the article. */}
          {toc.length > 0 ? (
            <details className="mt-8 surface-card p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium">On this page</summary>
              <div className="mt-3">
                <TableOfContents toc={toc} idPrefix="toc-mobile" visibleHeading={false} />
              </div>
            </details>
          ) : null}

          <div className="prose-blog mt-10 max-w-[68ch]">
            <Content components={blogMdxComponents} />
          </div>

          <div className="max-w-[68ch]">
            <AuditCta variant="end" />

            <ul className="mt-8 flex flex-wrap gap-1.5" aria-label="Tags">
              {post.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/blog?tag=${tag}`}
                    className="rounded-md border px-2.5 py-0.5 font-mono text-[11px] ink-secondary hover:text-[var(--ink-primary)]"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {related.length > 0 ? (
            <section aria-labelledby="related-heading" className="mt-14 max-w-[68ch] border-t pt-10">
              <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
                Keep reading
              </h2>
              <ul className="mt-5 space-y-4">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/blog/${item.slug}`} className="font-medium hover:underline underline-offset-4">
                      {item.title}
                    </Link>
                    <p className="mt-1 text-sm ink-secondary">{item.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        {/* Large screens: the contents stay in view beside the article. */}
        {toc.length > 0 ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6">
              <TableOfContents toc={toc} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
