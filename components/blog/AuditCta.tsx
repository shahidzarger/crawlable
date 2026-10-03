import Link from 'next/link';
import { AI_CRAWLERS, NON_RENDERING_CRAWLERS } from '@/lib/audit/crawlers';

/**
 * The call to action inside and at the end of every post.
 *
 * Numbers come from the crawler registry, never from the copy, so the CTA
 * cannot claim a count the scanner does not actually check. It is a plain
 * link to the scanner on the home page: no client JavaScript, no form, nothing
 * that could fail to hydrate in the middle of an article.
 */
export function AuditCta({ variant = 'inline' }: { variant?: 'inline' | 'end' }) {
  const heading =
    variant === 'end'
      ? 'Find out what AI crawlers actually read on your site'
      : 'Check your own site while you read';

  return (
    <aside
      aria-label="Run a free AI readability scan"
      className="not-prose my-10 surface-card p-6"
      style={{ borderColor: 'var(--accent)' }}
    >
      <p className="text-lg font-semibold tracking-tight">{heading}</p>
      <p className="mt-2 text-sm leading-relaxed ink-secondary">
        Crawlable fetches your page the way {NON_RENDERING_CRAWLERS.length} of the{' '}
        {AI_CRAWLERS.length} AI crawlers it tracks do — one HTTP request, no JavaScript — and
        shows you what survives, which bots your robots.txt lets in, and the files that fix the
        gaps.
      </p>
      <Link href="/#scan" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
        Run a free scan
      </Link>
    </aside>
  );
}
