import { PLATFORMS } from '@/content/platforms';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { FAQS } from '@/content/faq';
import { SITE_URL } from '@/lib/site-url';

export const dynamic = 'force-static';

/**
 * Our own llms.txt, generated from the same content the site renders.
 *
 * It is a route rather than a static file so it can never drift out of sync
 * with the pages that exist — which is exactly the advice the product gives.
 */
export function GET(): Response {
  const lines = [
    '# Crawlable',
    '',
    '> Crawlable audits a website the way non-rendering AI crawlers read it — raw HTML, no JavaScript — and generates the llms.txt, robots.txt and JSON-LD files that fix what it finds. Free single-page scan; $39 for a full 40-page audit with the generated files.',
    '',
    'Most AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) do not execute JavaScript. Content that only appears after hydration is invisible to them. Crawlable measures how much of a site they can actually read.',
    '',
    '## Start here',
    '',
    `- [Free AI readability scan](${SITE_URL}/#scan): enter a domain, get a real measurement of one page in about twenty seconds.`,
    `- [Pricing](${SITE_URL}/#pricing): $39 one-time for a full audit, $89 for five, $29/month for three websites with unlimited re-audits.`,
    `- [FAQ](${SITE_URL}/#faq): how this differs from AI visibility trackers, whether llms.txt works, what the audit covers.`,
    '',
    '## Platform guides',
    '',
    ...PLATFORMS.map(
      (platform) =>
        `- [Can AI crawlers read ${platform.name} sites?](${SITE_URL}/platforms/${platform.slug}): ${platform.verdict}`,
    ),
    '',
    '## AI crawler reference',
    '',
    `- [All AI crawlers](${SITE_URL}/ai-crawlers): which crawlers cost you visibility when blocked, and which are a licensing choice.`,
    ...AI_CRAWLERS.map(
      (crawler) =>
        `- [${crawler.token}](${SITE_URL}/ai-crawlers/${crawler.token.toLowerCase()}): ${crawler.operator}. ${crawler.note}`,
    ),
    '',
    '## Key facts',
    '',
    ...FAQS.slice(0, 3).map((faq) => `- ${faq.question} ${faq.answer}`),
    '',
    '## Optional',
    '',
    `- [Sitemap](${SITE_URL}/sitemap.xml): every indexable URL.`,
    '',
  ];

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
