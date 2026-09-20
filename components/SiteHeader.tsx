import Link from 'next/link';

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--accent)' }}
          />
          Crawlable
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/ai-crawlers"
            className="hidden rounded-lg px-3 py-1.5 ink-secondary transition-colors hover:text-[var(--ink-primary)] sm:block"
          >
            AI crawlers
          </Link>
          <Link
            href="/platforms"
            className="hidden rounded-lg px-3 py-1.5 ink-secondary transition-colors hover:text-[var(--ink-primary)] sm:block"
          >
            Platforms
          </Link>
          <Link
            href="/#pricing"
            className="rounded-lg px-3 py-1.5 ink-secondary transition-colors hover:text-[var(--ink-primary)]"
          >
            Pricing
          </Link>
          <Link href="/dashboard" className="btn-ghost ml-1 px-3 py-1.5 text-sm">
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
