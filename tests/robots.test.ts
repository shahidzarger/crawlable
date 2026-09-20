import { describe, expect, it } from 'vitest';
import {
  evaluateCrawlerAccess,
  isPathAllowed,
  parseRobots,
  selectGroup,
} from '@/lib/audit/robots';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';

describe('parseRobots', () => {
  it('groups consecutive user-agent lines into one rule group', () => {
    const { groups } = parseRobots(`
User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /private
Allow: /private/public
    `);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.userAgents).toEqual(['GPTBot', 'ClaudeBot']);
    expect(groups[0]?.disallow).toEqual(['/private']);
    expect(groups[0]?.allow).toEqual(['/private/public']);
  });

  it('starts a new group when a user-agent follows a rule', () => {
    const { groups } = parseRobots(`
User-agent: *
Disallow: /admin

User-agent: GPTBot
Disallow: /
    `);

    expect(groups).toHaveLength(2);
    expect(groups[1]?.userAgents).toEqual(['GPTBot']);
  });

  it('collects sitemaps and ignores comments', () => {
    const { sitemaps } = parseRobots(`
# a comment
Sitemap: https://example.com/sitemap.xml
User-agent: * # trailing comment
Disallow:
    `);

    expect(sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('treats an empty Disallow as no rule', () => {
    const { groups } = parseRobots('User-agent: *\nDisallow:');
    expect(groups[0]?.disallow).toEqual([]);
  });

  it('parses crawl-delay', () => {
    const { groups } = parseRobots('User-agent: *\nCrawl-delay: 2.5');
    expect(groups[0]?.crawlDelay).toBe(2.5);
  });
});

describe('selectGroup', () => {
  const { groups } = parseRobots(`
User-agent: *
Disallow: /

User-agent: GPTBot
Allow: /
  `);

  it('prefers an explicit match over the wildcard', () => {
    const result = selectGroup(groups, 'GPTBot');
    expect(result.explicit).toBe(true);
    expect(result.group?.userAgents).toEqual(['GPTBot']);
  });

  it('is case-insensitive', () => {
    expect(selectGroup(groups, 'gptbot').explicit).toBe(true);
  });

  it('falls back to the wildcard group', () => {
    const result = selectGroup(groups, 'PerplexityBot');
    expect(result.explicit).toBe(false);
    expect(result.group?.userAgents).toEqual(['*']);
  });
});

describe('isPathAllowed', () => {
  it('allows everything when there is no group', () => {
    expect(isPathAllowed(null, '/anything').allowed).toBe(true);
  });

  it('applies a blanket disallow', () => {
    const { groups } = parseRobots('User-agent: *\nDisallow: /');
    expect(isPathAllowed(groups[0] ?? null, '/').allowed).toBe(false);
  });

  it('lets the longest match win', () => {
    const { groups } = parseRobots(`
User-agent: *
Disallow: /docs
Allow: /docs/public
    `);

    const group = groups[0] ?? null;
    expect(isPathAllowed(group, '/docs/private').allowed).toBe(false);
    expect(isPathAllowed(group, '/docs/public/page').allowed).toBe(true);
  });

  it('gives Allow the tie on an equal-length match', () => {
    const { groups } = parseRobots('User-agent: *\nDisallow: /x\nAllow: /x');
    expect(isPathAllowed(groups[0] ?? null, '/x').allowed).toBe(true);
  });

  it('honours wildcards and end anchors', () => {
    const { groups } = parseRobots('User-agent: *\nDisallow: /*.pdf$');
    const group = groups[0] ?? null;
    expect(isPathAllowed(group, '/files/report.pdf').allowed).toBe(false);
    expect(isPathAllowed(group, '/files/report.pdf.html').allowed).toBe(true);
  });
});

describe('evaluateCrawlerAccess', () => {
  it('reports every registered crawler', () => {
    const access = evaluateCrawlerAccess(parseRobots('').groups);
    expect(access).toHaveLength(AI_CRAWLERS.length);
    expect(access.every((item) => item.allowed)).toBe(true);
  });

  it('distinguishes an explicit block from an inherited one', () => {
    const { groups } = parseRobots(`
User-agent: *
Disallow: /

User-agent: GPTBot
Allow: /
    `);

    const access = evaluateCrawlerAccess(groups);
    const gptbot = access.find((item) => item.crawler.token === 'GPTBot');
    const perplexity = access.find((item) => item.crawler.token === 'PerplexityBot');

    expect(gptbot?.allowed).toBe(true);
    expect(gptbot?.explicit).toBe(true);
    expect(perplexity?.allowed).toBe(false);
    expect(perplexity?.explicit).toBe(false);
  });
});
