import type { MetadataRoute } from 'next';
import { PLATFORMS } from '@/content/platforms';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { getPostSummaries } from '@/lib/blog/posts';
import { SITE_URL } from '@/lib/site-url';

/**
 * The sitemap.
 *
 * Priority and changeFrequency are hints, not instructions — Google has said
 * for years that it largely ignores them. They are set deliberately anyway,
 * because the other consumers of this file (Bing, and the AI crawlers this
 * product is about) do read them, and because a sitemap that claims every page
 * changes daily is a sitemap nobody trusts.
 *
 * Every route is listed explicitly rather than discovered, so adding a page
 * without adding it here is a visible omission rather than a silent one.
 */

interface StaticRoute {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}

const STATIC_ROUTES: readonly StaticRoute[] = [
  // The scanner lives on the home page, so this is the route that actually
  // changes — the pricing and crawler counts move with the registry.
  { path: '', changeFrequency: 'daily', priority: 1 },

  // Hub pages for the two programmatic sets below.
  { path: '/platforms', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/ai-crawlers', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },

  { path: '/contact', changeFrequency: 'monthly', priority: 0.8 },

  // Indexed deliberately: a sysadmin who sees CrawlableBot in their logs may
  // search for it rather than follow the URL in the user-agent string.
  { path: '/bot', changeFrequency: 'yearly', priority: 0.5 },

  /*
   * Legal pages are indexed deliberately: a buyer checking whether a small
   * vendor is legitimate looks for these, and an absent refund policy reads as
   * evasive. Low priority, rarely changing.
   */
  { path: '/terms', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/refunds', changeFrequency: 'yearly', priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = STATIC_ROUTES.map((route) => ({
    /*
     * The home page is emitted as "/", not as a bare origin.
     *
     * Both are valid and resolve identically, but the rest of the codebase
     * canonicalises the root WITH the slash (see canonicalKey), and a sitemap
     * that disagrees with the canonical tag on the same page is the exact
     * ambiguity this product exists to find on other people's sites.
     */
    url: `${SITE_URL}${route.path === '' ? '/' : route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const platformRoutes = PLATFORMS.map((platform) => ({
    url: `${SITE_URL}/platforms/${platform.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const crawlerRoutes = AI_CRAWLERS.map((crawler) => ({
    url: `${SITE_URL}/ai-crawlers/${crawler.token.toLowerCase()}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  /*
   * Blog posts carry their real last-modified date (frontmatter `updated`,
   * else `date`) instead of the build time. A lastmod that changes on every
   * deploy tells crawlers every post was just edited, which is how a sitemap
   * teaches them to ignore its lastmod values altogether.
   *
   * A post whose canonical points elsewhere (a cross-post) is left out: a
   * sitemap should list only URLs that are their own canonical.
   */
  const postRoutes = getPostSummaries()
    .filter((post) => !post.canonical || post.canonical === `/blog/${post.slug}`)
    .map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(`${post.lastModified}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

  return [...staticRoutes, ...platformRoutes, ...crawlerRoutes, ...postRoutes];
}
