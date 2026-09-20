import type { Metadata } from 'next';
import Link from 'next/link';
import { AI_CRAWLERS, VISIBILITY_CRITICAL_CRAWLERS } from '@/lib/audit/crawlers';
import { SEVERITY } from '@/components/report/severity';

export const metadata: Metadata = {
  title: 'Every AI crawler, and what blocking each one costs you',
  description:
    'GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and the rest: who operates them, whether they run JavaScript, and which ones you lose visibility by blocking.',
  alternates: { canonical: '/ai-crawlers' },
};

export default function CrawlersIndex() {
  const training = AI_CRAWLERS.filter((crawler) => !crawler.blockingCostsVisibility);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">
        Every AI crawler, and what blocking it costs
      </h1>
      <p className="mt-4 text-lg leading-relaxed ink-secondary">
        Not all AI crawlers do the same job. Some collect content to train models. Others build
        the index behind an answer engine, or fetch a page because a user asked about it right
        now. Blocking the first kind costs you nothing in visibility. Blocking the second kind
        removes you from answers people actually read.
      </p>

      <section className="mt-12">
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span aria-hidden style={{ color: 'var(--data-bad)' }}>
            {SEVERITY.critical.icon}
          </span>
          Block these and you disappear
        </h2>
        <p className="mt-2 ink-secondary">
          {VISIBILITY_CRITICAL_CRAWLERS.length} retrieval and user-action crawlers. Each one
          feeds a surface a person is looking at.
        </p>
        <ul className="mt-5 space-y-3">
          {VISIBILITY_CRITICAL_CRAWLERS.map((crawler) => (
            <CrawlerRow key={crawler.token} token={crawler.token} name={crawler.name} operator={crawler.operator} note={crawler.note} rendersJs={crawler.rendersJavaScript} />
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          Blocking these is a licensing choice
        </h2>
        <p className="mt-2 ink-secondary">
          {training.length} training crawlers. Disallowing them keeps your content out of model
          training and has no effect on whether you appear in AI answers.
        </p>
        <ul className="mt-5 space-y-3">
          {training.map((crawler) => (
            <CrawlerRow key={crawler.token} token={crawler.token} name={crawler.name} operator={crawler.operator} note={crawler.note} rendersJs={crawler.rendersJavaScript} />
          ))}
        </ul>
      </section>

      <div className="mt-14 surface-card p-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Which of these can reach your site right now?
        </h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          The free scan parses your robots.txt and evaluates every crawler above against it —
          including the rules you inherited from a plugin, a CDN setting or a template you
          forgot about.
        </p>
        <Link href="/#scan" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Check my robots.txt
        </Link>
      </div>
    </div>
  );
}

function CrawlerRow({
  token,
  name,
  operator,
  note,
  rendersJs,
}: {
  token: string;
  name: string;
  operator: string;
  note: string;
  rendersJs: boolean;
}) {
  return (
    <li>
      <Link
        href={`/ai-crawlers/${token.toLowerCase()}`}
        className="surface-card block p-5 transition-colors hover:border-[var(--border-strong)]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-sm">{token}</h3>
          <span className="text-xs ink-muted">
            {operator} ·{' '}
            {rendersJs ? 'renders JavaScript' : 'raw HTML only'}
          </span>
        </div>
        <p className="mt-1.5 text-sm ink-secondary">{note}</p>
        <span className="sr-only">Read more about {name}</span>
      </Link>
    </li>
  );
}
