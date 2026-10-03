'use client';

import { useEffect, useState } from 'react';
import type { TocEntry } from '@/lib/blog/headings';

/**
 * The post's table of contents.
 *
 * The links are rendered on the server and work with JavaScript off; the
 * client only adds the "you are here" highlight. The highlight is the last
 * heading whose top has scrolled past a line just under the sticky header,
 * which matches what a reader would call the current section far better than
 * "whichever heading is most visible" does on short sections.
 */
export function TableOfContents({
  toc,
  idPrefix = 'toc',
  visibleHeading = true,
}: {
  toc: TocEntry[];
  idPrefix?: string;
  /** False inside a <details> whose <summary> already says "On this page". */
  visibleHeading?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = toc
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const OFFSET = 96; // sticky header height plus breathing room
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - OFFSET <= 0) current = heading.id;
        else break;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toc]);

  if (toc.length === 0) return null;

  return (
    <nav aria-labelledby={`${idPrefix}-heading`}>
      <p
        id={`${idPrefix}-heading`}
        className={
          visibleHeading ? 'text-xs font-semibold uppercase tracking-wider ink-muted' : 'sr-only'
        }
      >
        On this page
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {toc.map((entry) => {
          const isActive = entry.id === active;
          return (
            <li key={entry.id} className={entry.depth === 3 ? 'pl-4' : undefined}>
              <a
                href={`#${entry.id}`}
                aria-current={isActive ? 'location' : undefined}
                className="block border-l-2 pl-3 leading-snug transition-colors hover:text-[var(--ink-primary)]"
                style={{
                  borderColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                }}
              >
                {entry.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
