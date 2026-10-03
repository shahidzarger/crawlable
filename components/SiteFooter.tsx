import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { AI_CRAWLERS } from '@/lib/audit/crawlers';
import { PLATFORMS } from '@/content/platforms';
import { identityLine } from '@/lib/legal';

export function SiteFooter() {
  const year = new Date().getFullYear();
  /*
   * Trader identity, when it has been configured.
   *
   * A commercial site is expected to make its operator identifiable — UAE
   * consumer-protection rules and EU distance-selling rules both want a legal
   * name and a contactable address before a purchase, and the same address is
   * what CAN-SPAM requires in marketing email. It renders only when set,
   * because a placeholder address would be a false statement about who is
   * selling rather than a missing one.
   */
  const identity = identityLine();

  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em]">
              <BrandMark />
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
              <li>
                <Link href="/blog" className="ink-secondary hover:text-[var(--ink-primary)]">
                  Blog
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
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-xs ink-muted">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} Crawlable. All rights reserved.</p>
            <p>Crawls are rate-limited and respect your robots.txt.</p>
          </div>
          {identity ? <address className="mt-3 not-italic">{identity}</address> : null}
        </div>
      </div>
    </footer>
  );
}
