import type { Metadata } from 'next';
import Link from 'next/link';
import { PLATFORMS, RENDERING_LABEL } from '@/content/platforms';
import { scoreColor } from '@/components/report/severity';

export const metadata: Metadata = {
  title: 'Is your website platform readable by AI crawlers?',
  description:
    'How Next.js, React, WordPress, Shopify, Webflow, Squarespace, Wix, Astro, Framer, Vue, Angular and Gatsby each look to AI crawlers that do not run JavaScript.',
  alternates: { canonical: '/platforms' },
};

export default function PlatformsIndex() {
  const ranked = [...PLATFORMS].sort((a, b) => b.baselineScore - a.baselineScore);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">
        Which platforms AI crawlers can read
      </h1>
      <p className="mt-4 text-lg leading-relaxed ink-secondary">
        Most AI crawlers fetch raw HTML and never execute JavaScript. That single fact decides
        how much of your site they can see, and it is almost entirely determined by the
        platform you built on and how you configured it.
      </p>
      <p className="mt-4 leading-relaxed ink-secondary">
        Below is a baseline for each platform, before any tuning. Your own configuration can
        move it a long way in either direction — which is what the{' '}
        <Link href="/#scan" className="underline underline-offset-4">
          free scan
        </Link>{' '}
        measures.
      </p>

      <ul className="mt-12 space-y-3">
        {ranked.map((platform) => (
          <li key={platform.slug}>
            <Link
              href={`/platforms/${platform.slug}`}
              className="surface-card flex items-center gap-4 p-5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex-1">
                <h2 className="font-medium">{platform.name}</h2>
                <p className="mt-1 text-sm ink-secondary">{platform.verdict}</p>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color: scoreColor(platform.baselineScore) }}
                >
                  {platform.baselineScore}
                </div>
                <div className="text-[11px] ink-muted">
                  {RENDERING_LABEL[platform.rendering]}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 surface-card p-6">
        <h2 className="font-semibold">Baselines are not your score</h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          A Next.js site with every page marked &quot;use client&quot; scores worse than a plain
          WordPress blog. The platform sets the ceiling; your configuration decides where under
          it you land.
        </p>
        <Link href="/#scan" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Scan your actual site
        </Link>
      </div>
    </div>
  );
}
