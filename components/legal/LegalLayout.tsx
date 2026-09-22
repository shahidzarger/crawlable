import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared shell for the three legal pages.
 *
 * Kept in one place so the three cannot drift apart in tone or effective date,
 * which is the usual way these documents start contradicting each other. The
 * typography deliberately matches the programmatic content pages rather than
 * shrinking into fine print: terms nobody can read are terms nobody agreed to.
 */

/** Single source of truth for the date shown on every legal page. */
export const LEGAL_EFFECTIVE_DATE = '22 September 2026';

export const SUPPORT_EMAIL = 'support@usecrawlable.com';

export function LegalLayout({
  title,
  summary,
  children,
}: {
  title: string;
  /** One plain-language sentence, above the formal text. */
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <nav className="text-xs ink-muted">
        <Link href="/" className="hover:text-[var(--ink-secondary)]">
          Crawlable
        </Link>{' '}
        / {title}
      </nav>

      <h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1>

      <p className="mt-4 text-lg leading-relaxed ink-secondary">{summary}</p>

      <p className="mt-6 text-xs ink-muted">
        Effective {LEGAL_EFFECTIVE_DATE}. We will post any material change on this page
        before it takes effect.
      </p>

      <div className="mt-12 space-y-10">{children}</div>

      <div className="mt-16 surface-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Questions</h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          Anything here that is unclear, email{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline underline-offset-4 hover:text-[var(--ink-primary)]"
          >
            {SUPPORT_EMAIL}
          </a>
          . A real person reads it.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm">
        <Link href="/terms" className="ink-secondary hover:text-[var(--ink-primary)]">
          Terms
        </Link>
        <Link href="/privacy" className="ink-secondary hover:text-[var(--ink-primary)]">
          Privacy
        </Link>
        <Link href="/refunds" className="ink-secondary hover:text-[var(--ink-primary)]">
          Refunds
        </Link>
      </div>
    </div>
  );
}

/** A numbered top-level clause. */
export function Clause({
  n,
  heading,
  children,
}: {
  n: number;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="flex gap-3 text-2xl font-semibold tracking-tight">
        <span className="mt-1.5 font-mono text-xs ink-muted tabular-nums">
          {String(n).padStart(2, '0')}
        </span>
        <span>{heading}</span>
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed ink-secondary">{children}</div>
    </section>
  );
}

/**
 * A callout for the points a customer is most likely to be caught out by.
 * Uses the warning colour paired with an icon and a word, never colour alone.
 */
export function Important({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-md border px-4 py-3 text-sm"
      style={{ borderColor: 'var(--data-warn)' }}
    >
      <p className="font-medium">
        <span aria-hidden style={{ color: 'var(--data-warn)' }}>
          ◆
        </span>{' '}
        Worth knowing
      </p>
      <div className="mt-1 ink-secondary">{children}</div>
    </div>
  );
}
