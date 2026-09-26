import type { Metadata } from 'next';
import Link from 'next/link';
import { USER_AGENT } from '@/lib/audit/fetcher';
import { CRAWLABLE_BOT_TOKEN } from '@/lib/audit/robots';
import { AUDIT_BUDGET_MS, PAGE_LIMITS } from '@/lib/audit';
import { SUPPORT_EMAIL } from '@/lib/support';

/**
 * The page CrawlableBot's user agent points at.
 *
 * A sysadmin who sees an unfamiliar bot in their access log looks up the URL in
 * its user-agent string, and what they find decides whether they treat it as a
 * tool or as an intruder. That makes this page part of the crawler's honesty
 * claim rather than marketing: everything on it is read from the same
 * constants the crawler itself uses, so it cannot describe behaviour the code
 * does not have.
 */

export const metadata: Metadata = {
  title: 'CrawlableBot',
  description:
    'What CrawlableBot is, the exact user-agent string it sends, how it behaves, and how to block it.',
  alternates: { canonical: '/bot' },
};

export default function BotPage() {
  const budgetSeconds = Math.round(AUDIT_BUDGET_MS / 1000);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <nav className="text-xs ink-muted">
        <Link href="/" className="hover:text-[var(--ink-secondary)]">
          Crawlable
        </Link>{' '}
        / CrawlableBot
      </nav>

      <h1 className="mt-4 text-4xl font-semibold tracking-tight">CrawlableBot</h1>

      <p className="mt-4 text-lg leading-relaxed ink-secondary">
        CrawlableBot is a diagnostic crawler operated by Crawlable (usecrawlable.com) to test
        website crawlability, server-rendered raw HTML, and bot directive readiness.
      </p>

      <p className="mt-4 leading-relaxed ink-secondary">
        If you found this page in your access logs, someone ran a diagnostic scan against
        your site. Everything below describes exactly what that involved.
      </p>

      <Section heading="The user-agent string">
        <p>Every request CrawlableBot makes sends this header, unmodified:</p>
        <div className="mt-3 code-block p-4">
          <code className="break-all">{USER_AGENT}</code>
        </div>
        <p className="mt-3">
          We do not rotate user agents, spoof a browser, or send requests under any other
          identity. If a request claims to be a browser, it is not us.
        </p>
      </Section>

      <Section heading="How it behaves">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>On demand only.</strong> There is no schedule and no background
            crawling. A scan happens when a person enters a domain and asks for one, and
            stops when that scan finishes.
          </li>
          <li>
            <strong>Small and bounded.</strong> At most {PAGE_LIMITS.audit} pages per audit,
            four concurrent connections, and a hard {budgetSeconds}-second wall-clock budget
            for the whole crawl. Add your <code className="font-mono text-sm">robots.txt</code>
            , <code className="font-mono text-sm">llms.txt</code> and sitemap and the total is
            around fifty requests.
          </li>
          <li>
            <strong>Read-only.</strong> GET requests for public pages. Nothing is submitted,
            no forms, no state changed.
          </li>
          <li>
            <strong>Public content only.</strong> We do not attempt to bypass logins,
            paywalls or access controls, and we do not index private data. A page that
            requires authentication is simply recorded as unreachable.
          </li>
          <li>
            <strong>No JavaScript.</strong> One HTTP request per page, no headless browser.
            That is the point: it measures what a non-rendering AI crawler would receive.
          </li>
        </ul>
      </Section>

      <Section heading="Blocking CrawlableBot">
        <p>
          Add this to your <code className="font-mono text-sm">robots.txt</code> and we will
          stop, permanently and immediately:
        </p>
        <div className="mt-3 code-block p-4">
          <pre className="whitespace-pre">{`User-agent: ${CRAWLABLE_BOT_TOKEN}\nDisallow: /`}</pre>
        </div>
        <p className="mt-3">
          The rule is checked before any page is fetched, so an opted-out site is never
          crawled — the only request we make is for{' '}
          <code className="font-mono text-sm">robots.txt</code> itself. Anyone who tries to
          scan the site gets a refusal instead of a report.
        </p>

        <div
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--data-warn)' }}
        >
          <p className="font-medium">
            <span aria-hidden style={{ color: 'var(--data-warn)' }}>
              ◆
            </span>{' '}
            Worth knowing
          </p>
          <div className="mt-1 ink-secondary">
            <p>
              The rule has to name <code className="font-mono text-xs">{CRAWLABLE_BOT_TOKEN}</code>.
              A wildcard <code className="font-mono text-xs">Disallow: /</code> under{' '}
              <code className="font-mono text-xs">User-agent: *</code> will not stop us,
              because measuring what happens to a site that blocks crawlers is the diagnosis
              the tool exists to perform — and the report will tell its owner exactly that.
            </p>
          </div>
        </div>

        <p className="mt-4">
          You can also email{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline underline-offset-4 hover:text-[var(--ink-primary)]"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will block your domain at our end. A real person reads it.
        </p>
      </Section>

      <Section heading="Seeing more traffic than this describes?">
        <p>
          Then it probably is not us. Send us the log lines — timestamps, paths and source
          IPs — at{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline underline-offset-4 hover:text-[var(--ink-primary)]"
          >
            {SUPPORT_EMAIL}
          </a>
          . Anyone can put our string in their user-agent header, and we would rather know
          when someone does.
        </p>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm">
        <Link href="/terms" className="ink-secondary hover:text-[var(--ink-primary)]">
          Terms
        </Link>
        <Link href="/privacy" className="ink-secondary hover:text-[var(--ink-primary)]">
          Privacy
        </Link>
        <Link href="/contact" className="ink-secondary hover:text-[var(--ink-primary)]">
          Contact
        </Link>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-3 leading-relaxed ink-secondary">{children}</div>
    </section>
  );
}
