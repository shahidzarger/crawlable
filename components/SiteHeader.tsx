import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { MobileMenu } from './MobileMenu';
import { NAV_LINKS } from './nav-links';

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}
    >
      {/* relative: the mobile menu panel is positioned against this bar. */}
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em]">
          <BrandMark />
          Crawlable
        </Link>

        {/* md and up: every link inline. */}
        <nav aria-label="Main" className="hidden items-center gap-1 whitespace-nowrap text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 ink-secondary transition-colors hover:text-[var(--ink-primary)]"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/dashboard" className="btn-ghost ml-1 px-3 py-1.5 text-sm">
            Dashboard
          </Link>
        </nav>

        {/* Below md: one button that opens the full list. */}
        <MobileMenu />
      </div>
    </header>
  );
}
