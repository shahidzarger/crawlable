import { describe, expect, it } from 'vitest';
import { isCrawlableBotOptedOut, parseRobots } from '@/lib/audit/robots';
import type { RobotsAnalysis } from '@/lib/audit/types';

/**
 * The /bot page tells site owners they can block CrawlableBot by naming it in
 * robots.txt. These are the assertions that keep that sentence true.
 */

function analysis(raw: string | null): RobotsAnalysis {
  if (raw === null) {
    return {
      found: false,
      url: 'https://example.com/robots.txt',
      status: 404,
      raw: null,
      groups: [],
      sitemaps: [],
      crawlerAccess: [],
      error: null,
    };
  }
  const parsed = parseRobots(raw);
  return {
    found: true,
    url: 'https://example.com/robots.txt',
    status: 200,
    raw,
    groups: parsed.groups,
    sitemaps: parsed.sitemaps,
    crawlerAccess: [],
    error: null,
  };
}

describe('isCrawlableBotOptedOut', () => {
  it('honours a rule that names CrawlableBot', () => {
    expect(
      isCrawlableBotOptedOut(analysis('User-agent: CrawlableBot\nDisallow: /')),
    ).toBe(true);
  });

  it('is case-insensitive about the token', () => {
    expect(
      isCrawlableBotOptedOut(analysis('User-agent: crawlablebot\nDisallow: /')),
    ).toBe(true);
  });

  it('ignores a wildcard Disallow', () => {
    /*
     * Deliberate, and the most important assertion here. Honouring `*` would
     * make the product unable to audit a large share of the sites that most
     * need auditing — and the owner never asked us anything. The opt-out is
     * for owners who name this crawler on purpose.
     */
    expect(isCrawlableBotOptedOut(analysis('User-agent: *\nDisallow: /'))).toBe(false);
  });

  it('does not opt out a site that merely mentions CrawlableBot', () => {
    expect(
      isCrawlableBotOptedOut(analysis('User-agent: CrawlableBot\nAllow: /')),
    ).toBe(false);
  });

  it('respects a partial disallow without blocking the whole audit', () => {
    // Blocking /private/ is not an opt-out from being audited at all.
    expect(
      isCrawlableBotOptedOut(analysis('User-agent: CrawlableBot\nDisallow: /private/')),
    ).toBe(false);
  });

  it('treats a missing robots.txt as no opt-out', () => {
    expect(isCrawlableBotOptedOut(analysis(null))).toBe(false);
  });

  it('is not confused by another bot being blocked', () => {
    expect(
      isCrawlableBotOptedOut(
        analysis('User-agent: GPTBot\nDisallow: /\n\nUser-agent: CrawlableBot\nAllow: /'),
      ),
    ).toBe(false);
  });
});
