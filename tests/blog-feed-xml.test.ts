// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildRss } from '@/lib/blog/seo';
import { getPostSummaries } from '@/lib/blog/posts';

/**
 * The feed parsed by a real XML parser.
 *
 * Feed readers reject a whole feed on one unescaped ampersand, so string
 * assertions are not enough: this runs the real posts plus a hostile title
 * through DOMParser and requires zero parse errors.
 */
describe('RSS feed is well-formed XML', () => {
  it('parses cleanly with the real posts and a hostile title', () => {
    const hostile = {
      ...getPostSummaries()[0]!,
      slug: 'hostile',
      title: `Tom & Jerry's "<script>" guide`,
    };
    const xml = buildRss([...getPostSummaries(), hostile], 'https://usecrawlable.com');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('item')).toHaveLength(getPostSummaries().length + 1);
    const titles = [...doc.getElementsByTagName('item')].map(
      (item) => item.getElementsByTagName('title')[0]?.textContent,
    );
    expect(titles).toContain(`Tom & Jerry's "<script>" guide`);
  });
});
