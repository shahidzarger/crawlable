import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PLATFORMS,
  RENDERING_LABEL,
  RENDERING_VERDICT,
  platformBySlug,
} from '@/content/platforms';
import { scoreColor, SEVERITY } from '@/components/report/severity';
import { NON_RENDERING_CRAWLERS } from '@/lib/audit/crawlers';
import { SITE_URL } from '@/lib/site-url';

/**
 * Programmatic SEO page, one per platform.
 *
 * These are statically generated at build time, which is the point: a page
 * about AI crawlers that could not be read by an AI crawler would be a poor
 * advertisement.
 */

export function generateStaticParams() {
  return PLATFORMS.map((platform) => ({ slug: platform.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const platform = platformBySlug(slug);
  if (!platform) return { title: 'Platform not found' };

  const title = `Can AI crawlers read ${platform.name} sites?`;

  return {
    title,
    description: platform.verdict,
    alternates: { canonical: `/platforms/${platform.slug}` },
    openGraph: { title, description: platform.verdict, type: 'article' },
  };
}

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const platform = platformBySlug(slug);
  if (!platform) notFound();

  const others = PLATFORMS.filter((item) => item.slug !== platform.slug).slice(0, 6);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `Can AI crawlers read ${platform.name} sites?`,
    description: platform.verdict,
    url: `${SITE_URL}/platforms/${platform.slug}`,
    about: { '@type': 'SoftwareApplication', name: platform.name },
    publisher: { '@type': 'Organization', name: 'Crawlable', url: SITE_URL },
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-xs ink-muted">
        <Link href="/platforms" className="hover:text-[var(--ink-secondary)]">
          Platforms
        </Link>{' '}
        / {platform.name}
      </nav>

      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Can AI crawlers read {platform.name} sites?
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="surface-card px-5 py-3">
          <div className="text-[11px] uppercase tracking-wider ink-muted">Baseline</div>
          <div
            className="text-3xl font-semibold tabular-nums"
            style={{ color: scoreColor(platform.baselineScore) }}
          >
            {platform.baselineScore}
            <span className="text-base ink-muted">/100</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">{RENDERING_LABEL[platform.rendering]}</p>
          <p className="text-sm ink-secondary">{RENDERING_VERDICT[platform.rendering]}</p>
        </div>
      </div>

      <p className="mt-8 text-lg leading-relaxed">{platform.verdict}</p>

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">What is actually happening</h2>
      <p className="mt-3 leading-relaxed ink-secondary">{platform.mechanism}</p>
      <p className="mt-4 leading-relaxed ink-secondary">
        {NON_RENDERING_CRAWLERS.length} of the major AI crawlers — including{' '}
        {NON_RENDERING_CRAWLERS.slice(0, 3)
          .map((crawler) => crawler.name)
          .join(', ')}{' '}
        — fetch your HTML and parse it without running a JavaScript engine. Anything your page
        adds after hydration is not part of what they read.
      </p>

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">
        What to do on {platform.name}
      </h2>
      <ol className="mt-4 space-y-4">
        {platform.fixes.map((fix, index) => (
          <li key={fix} className="flex gap-4">
            <span className="mt-0.5 font-mono text-xs ink-muted tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="leading-relaxed ink-secondary">{fix}</span>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">What trips people up</h2>
      <ul className="mt-4 space-y-3">
        {platform.gotchas.map((gotcha) => (
          <li key={gotcha} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-0.5" style={{ color: 'var(--data-warn)' }}>
              {SEVERITY.warning.icon}
            </span>
            <span className="ink-secondary">{gotcha}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">
        Where the files go on {platform.name}
      </h2>
      <p className="mt-3 leading-relaxed ink-secondary">{platform.filePlacement}</p>

      <div className="mt-12 surface-card p-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Stop guessing where your site sits
        </h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          The baseline above is the platform. The free scan measures your actual site: how many
          words a crawler reads, whether your pages come back as empty shells, and which
          crawlers your robots.txt lets in.
        </p>
        <Link href="/#scan" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Scan my {platform.name} site
        </Link>
      </div>

      <h2 className="mt-14 text-sm font-semibold uppercase tracking-wider ink-muted">
        Other platforms
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {others.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/platforms/${item.slug}`}
              className="btn-ghost inline-block px-3 py-1.5 text-sm"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
