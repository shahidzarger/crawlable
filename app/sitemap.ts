import type { MetadataRoute } from 'next';
import { PLATFORMS } from '@/content/platforms';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { SITE_URL } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = ['', '/platforms', '/ai-crawlers'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.8,
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

  return [...staticRoutes, ...platformRoutes, ...crawlerRoutes];
}
