import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { store } from '@/lib/db';
import { prioritisedFindings } from '@/lib/audit/scoring';
import { ScoreHero } from '@/components/report/ScoreHero';
import { DimensionBars } from '@/components/report/DimensionBars';
import { FindingList } from '@/components/report/FindingList';
import { CrawlerMatrix } from '@/components/report/CrawlerMatrix';
import { PageTable } from '@/components/report/PageTable';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: 'Report not found' };

  const db = await store();
  const record = await db.getAudit(id);
  if (!record) return { title: 'Report not found' };

  const host = record.siteUrl.replace(/^https?:\/\//, '');

  return {
    title: `${host} — ${record.score}/100 AI readability`,
    description: `${record.invisiblePercent}% of audited pages on ${host} are invisible to AI crawlers.`,
    // Reports are shareable by link but should not be indexed.
    robots: { index: false, follow: false },
  };
}

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = await store();
  const record = await db.getAudit(id);
  if (!record) notFound();

  const result = record.result;
  const findings = prioritisedFindings(result.checks);
  const isScan = result.mode === 'scan';

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs ink-muted">
          Report {record.id.slice(0, 8)} · {new Date(result.createdAt).toISOString().slice(0, 10)} ·{' '}
          {isScan ? 'free single-page scan' : `${result.pagesAudited}-page audit`}
        </p>
        <Link href="/dashboard" className="text-xs underline underline-offset-4">
          Back to dashboard
        </Link>
      </div>

      <div className="space-y-6">
        <ScoreHero
          score={result.score}
          grade={result.grade}
          invisiblePercent={result.invisiblePercent}
          pagesAudited={result.pagesAudited}
          siteUrl={result.siteUrl}
        />

        <DimensionBars checks={result.checks} />

        <FindingList findings={findings} />

        <CrawlerMatrix access={result.robots.crawlerAccess} />

        {result.pages.length > 1 ? <PageTable pages={result.pages} /> : null}

        {isScan ? (
          <section className="surface-card p-6">
            <h2 className="font-semibold">This was a single-page scan</h2>
            <p className="mt-2 text-sm ink-secondary">
              A full audit crawls up to 40 pages and generates your llms.txt, robots.txt and
              JSON-LD from what it finds.
            </p>
            <Link href="/#pricing" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
              Run the full audit
            </Link>
          </section>
        ) : (
          <section className="surface-card p-6">
            <h2 className="font-semibold">Your generated files</h2>
            <p className="mt-2 text-sm ink-secondary">
              Download them from the dashboard, where your license key is loaded. They are
              generated from this crawl, not from a template.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {(['FIXES.md', 'llms.txt', 'robots.txt', 'schema.jsonld'] as const).map((file) => (
                <li key={file} className="flex items-baseline gap-3">
                  <code
                    className="rounded-md px-2 py-0.5 font-mono text-xs"
                    style={{ background: 'var(--surface-sunken)', color: 'var(--accent)' }}
                  >
                    {file}
                  </code>
                  <span className="ink-secondary">
                    {file === 'FIXES.md'
                      ? 'Every finding, ordered, with affected URLs'
                      : file === 'llms.txt'
                        ? 'Built from your real pages and sections'
                        : file === 'robots.txt'
                          ? 'Retrieval crawlers allowed, your rules preserved'
                          : 'Organization, WebSite and BreadcrumbList blocks'}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/dashboard" className="btn-primary mt-5 inline-block px-5 py-2.5 text-sm">
              Open dashboard to download
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
