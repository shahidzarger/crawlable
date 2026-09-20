import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AI_CRAWLERS, findCrawler } from '@/lib/audit/crawlers';
import { crawlerNote } from '@/content/crawler-notes';
import { SEVERITY } from '@/components/report/severity';
import { SITE_URL } from '@/lib/site-url';

/** One statically generated page per AI crawler. */

export function generateStaticParams() {
  return AI_CRAWLERS.map((crawler) => ({ token: crawler.token.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const crawler = findCrawler(token);
  if (!crawler) return { title: 'Crawler not found' };

  const title = `${crawler.token}: what it is and whether to block it`;
  const description = `${crawler.token} is ${crawler.operator}'s ${
    crawler.purpose === 'training'
      ? 'training crawler'
      : crawler.purpose === 'search-index'
        ? 'search index crawler'
        : 'user-action fetcher'
  }. ${crawler.note}`;

  return {
    title,
    description,
    alternates: { canonical: `/ai-crawlers/${crawler.token.toLowerCase()}` },
    openGraph: { title, description, type: 'article' },
  };
}

const PURPOSE_COPY = {
  training: {
    label: 'Training crawler',
    what: 'collects page content to be used in model training',
    blocking:
      'Blocking it keeps your content out of the training corpus. It does not remove you from any answer surface, because this crawler is not what answers are built from.',
  },
  'search-index': {
    label: 'Search index crawler',
    what: 'builds the index that answers are retrieved from',
    blocking:
      'Blocking it removes you from the index that answers are drawn from. Your pages stop being available as a source, and you will simply not be cited.',
  },
  'user-agent-action': {
    label: 'User-action fetcher',
    what: 'fetches a page because a user asked about that specific link',
    blocking:
      'Blocking it means that when someone pastes your URL and asks what it says, the assistant cannot read it and says so. This is the most direct visibility loss of the three.',
  },
} as const;

export default async function CrawlerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const crawler = findCrawler(token);
  if (!crawler) notFound();

  const purpose = PURPOSE_COPY[crawler.purpose];
  const note = crawlerNote(crawler.token);
  const related = AI_CRAWLERS.filter(
    (item) => item.operator === crawler.operator && item.token !== crawler.token,
  );

  const allowSnippet = `User-agent: ${crawler.token}\nAllow: /`;
  const blockSnippet = `User-agent: ${crawler.token}\nDisallow: /`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${crawler.token}: what it is and whether to block it`,
    description: crawler.note,
    url: `${SITE_URL}/ai-crawlers/${crawler.token.toLowerCase()}`,
    publisher: { '@type': 'Organization', name: 'Crawlable', url: SITE_URL },
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-xs ink-muted">
        <Link href="/ai-crawlers" className="hover:text-[var(--ink-secondary)]">
          AI crawlers
        </Link>{' '}
        / {crawler.token}
      </nav>

      <h1 className="mt-4 font-mono text-4xl font-semibold tracking-tight">{crawler.token}</h1>
      <p className="mt-3 text-lg ink-secondary">
        {crawler.operator} · {purpose.label}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Fact label="Operator" value={crawler.operator} />
        <Fact
          label="Runs JavaScript"
          value={crawler.rendersJavaScript ? 'Yes' : 'No'}
          tone={crawler.rendersJavaScript ? 'good' : 'bad'}
        />
        <Fact
          label="Blocking costs visibility"
          value={crawler.blockingCostsVisibility ? 'Yes' : 'No'}
          tone={crawler.blockingCostsVisibility ? 'bad' : 'good'}
        />
      </div>

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">What it does</h2>
      <p className="mt-3 leading-relaxed ink-secondary">
        {crawler.token} {purpose.what}. {crawler.note}
      </p>

      {!crawler.rendersJavaScript ? (
        <p className="mt-4 leading-relaxed ink-secondary">
          It does not execute JavaScript. Whatever your server returns in the initial HTML
          response is the entire page as far as {crawler.token} is concerned — if your content
          is rendered client-side, this crawler reads an empty container.
        </p>
      ) : (
        <p className="mt-4 leading-relaxed ink-secondary">
          It runs on rendering infrastructure, so client-side content is generally visible to
          it. That makes it the exception rather than the rule among AI crawlers.
        </p>
      )}

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">
        Should you block {crawler.token}?
      </h2>
      <p className="mt-3 leading-relaxed ink-secondary">{purpose.blocking}</p>
      {note ? (
        <p className="mt-4 leading-relaxed ink-secondary">{note.consequence}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden style={{ color: 'var(--data-good)' }}>
              ✓
            </span>
            To allow it
          </h3>
          <pre className="code-block mt-2 p-3">
            <code>{allowSnippet}</code>
          </pre>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden
              style={{
                color: crawler.blockingCostsVisibility ? 'var(--data-bad)' : 'var(--data-warn)',
              }}
            >
              {crawler.blockingCostsVisibility ? SEVERITY.critical.icon : SEVERITY.warning.icon}
            </span>
            To block it
          </h3>
          <pre className="code-block mt-2 p-3">
            <code>{blockSnippet}</code>
          </pre>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed ink-secondary">
        Put the rule in your robots.txt at the site root. A group that names {crawler.token}
        {' '}explicitly takes precedence over your <code className="font-mono text-xs">User-agent: *</code>{' '}
        group, so naming it is how you make your intent survive later edits to the wildcard rules.
      </p>

      {note ? (
        <>
          <h2 className="mt-12 text-2xl font-semibold tracking-tight">
            Verifying a real {crawler.token} request
          </h2>
          <p className="mt-3 leading-relaxed ink-secondary">{note.verification}</p>

          <h2 className="mt-12 text-2xl font-semibold tracking-tight">
            The mistake people make
          </h2>
          <div className="mt-3 flex gap-3">
            <span aria-hidden className="mt-1" style={{ color: 'var(--data-warn)' }}>
              {SEVERITY.warning.icon}
            </span>
            <p className="leading-relaxed ink-secondary">{note.commonMistake}</p>
          </div>
        </>
      ) : null}

      {related.length > 0 ? (
        <>
          <h2 className="mt-12 text-2xl font-semibold tracking-tight">
            {crawler.operator}&apos;s other crawlers
          </h2>
          <ul className="mt-4 space-y-2">
            {related.map((item) => (
              <li key={item.token}>
                <Link
                  href={`/ai-crawlers/${item.token.toLowerCase()}`}
                  className="text-sm underline underline-offset-4"
                >
                  {item.token}
                </Link>
                <span className="ml-2 text-sm ink-secondary">{item.note}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-12 surface-card p-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Can {crawler.token} reach your site?
        </h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          The free scan parses your robots.txt, evaluates every AI crawler against it, and
          tells you how much of a page {crawler.token} would actually come away with.
        </p>
        <Link href="/#scan" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Run the free scan
        </Link>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  const color =
    tone === 'bad'
      ? 'var(--data-bad)'
      : tone === 'good'
        ? 'var(--data-good)'
        : 'var(--ink-primary)';

  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)' }}>
      <div className="text-[11px] uppercase tracking-wider ink-muted">{label}</div>
      <div className="mt-1 font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
