'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { NAV_LINKS } from './nav-links';

/**
 * The small-screen menu: a button that opens a panel with every nav link.
 *
 * Built on <details>/<summary>, so it opens and closes with JavaScript off and
 * a crawler sees every link in the HTML. The client code only adds what a
 * native disclosure lacks for site navigation:
 *
 *   - closes after a link is followed (client-side navigation keeps the
 *     header mounted, so it would otherwise stay open on the next page);
 *   - closes on Escape, returning focus to the button;
 *   - closes on a tap outside the header.
 *
 * Hidden at the `md` breakpoint (768px) and up, where the full inline nav shows.
 */
export function MobileMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  // Any navigation, including one to a #hash on the same page, closes it.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.open) {
        details.open = false;
        details.querySelector('summary')?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const header = details.closest('header');
      if (details.open && header && !header.contains(event.target as Node)) details.open = false;
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  return (
    <details ref={ref} className="mobile-menu md:hidden">
      <summary
        aria-label="Menu"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border-[1.5px]"
        style={{ borderColor: 'var(--outline)' }}
      >
        {/* Three bars that become a cross when open (CSS in globals.css). */}
        <span aria-hidden className="mobile-menu-icon">
          <span />
          <span />
          <span />
        </span>
      </summary>

      <nav
        aria-label="Main"
        className="absolute inset-x-0 top-full border-b px-4 pb-4 pt-2"
        style={{ background: 'var(--surface)' }}
      >
        <ul className="flex flex-col">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={close}
                className="block border-b py-3.5 text-base font-medium"
                style={{ color: 'var(--ink-primary)' }}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li className="pt-4">
            <Link href="/dashboard" onClick={close} className="btn-ghost block px-4 py-2.5 text-center text-base">
              Dashboard
            </Link>
          </li>
        </ul>
      </nav>
    </details>
  );
}
