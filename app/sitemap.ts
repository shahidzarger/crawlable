import type { MetadataRoute } from 'next';
import { PLATFORMS } from '@/content/platforms';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { SITE_URL } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = ['', '/platforms', '/ai-crawlers', '/contact'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  // Legal pages are indexed deliberately: a buyer checking whether a small
  // vendor is legitimate looks for these, and an absent refund policy reads as
  // evasive. Low priority, rarely changing.
  const legalRoutes = ['/terms', '/privacy', '/refunds'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
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

  return [...staticRoutes, ...legalRoutes, ...platformRoutes, ...crawlerRoutes];
}
