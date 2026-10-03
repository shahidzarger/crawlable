import { getPostSummaries } from '@/lib/blog/posts';
import { buildRss } from '@/lib/blog/seo';
import { SITE_URL } from '@/lib/site-url';

/**
 * RSS 2.0 feed of every published post, built at build time.
 *
 * Like llms.txt and the sitemap, it is generated from the same content the
 * pages render, so it cannot list a post that does not exist or miss one that
 * does.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildRss(getPostSummaries(), SITE_URL), {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
