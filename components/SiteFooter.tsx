import Link from 'next/link';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { PLATFORMS } from '@/content/platforms';
import { SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: 'var(--accent)' }}
              />
              Crawlable
            </div>
            <p className="mt-3 text-sm ink-secondary">
              See what AI crawlers actually read on your site, and get the files that fix it.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider ink-muted">
              Product
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/#scan" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Free scan
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="ink-secondary hover:text-[var(--ink-primary)]">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider ink-muted">
              AI crawlers
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {AI_CRAWLERS.slice(0, 6).map((crawler) => (
                <li key={crawler.token}>
                  <Link
                    href={`/ai-crawlers/${crawler.token.toLowerCase()}`}
                    className="ink-secondary hover:text-[var(--ink-primary)]"
                  >
                    {crawler.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/ai-crawlers" className="ink-secondary hover:text-[var(--ink-primary)]">
                  All crawlers →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider ink-muted">
              Platforms
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PLATFORMS.slice(0, 6).map((platform) => (
                <li key={platform.slug}>
                  <Link
                    href={`/platforms/${platform.slug}`}
                    className="ink-secondary hover:text-[var(--ink-primary)]"
                  >
                    {platform.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/platforms" className="ink-secondary hover:text-[var(--ink-primary)]">
                  All platforms →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider ink-muted">
              Company
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/terms" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/refunds" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Refund Policy
                </Link>
              </li>
              <li>
                <Link href="/contact" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Contact us
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="ink-secondary hover:text-[var(--ink-primary)]"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-xs ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Crawlable. All rights reserved.</p>
          <p>Crawls are rate-limited and respect your robots.txt.</p>
        </div>
      </div>
    </footer>
  );
}
