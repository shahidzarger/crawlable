import type { MetadataRoute } from 'next';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { SITE_URL } from '@/lib/site-url';

/**
 * Our own robots.txt, generated from the same crawler registry the audit uses.
 *
 * Every AI crawler is allowed explicitly. A tool that tells people to name AI
 * crawlers in their robots.txt should demonstrably do so itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((crawler) => ({
        userAgent: crawler.token,
        allow: '/',
        disallow: ['/dashboard', '/audit/', '/api/'],
      })),
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/audit/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
