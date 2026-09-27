'use client';

import { useEffect, useRef } from 'react';
import { heroInternals } from './hero-motion';

/**
 * Entrance motion for the hero, and nothing else.
 *
 * Wraps the existing hero content rather than replacing it: every heading,
 * every word of copy, the beta badge and the Scanner are passed straight
 * through as children and rendered by the server component above. This
 * component contributes a scope, an animated backdrop and two pieces of
 * behaviour — it has no opinion about what is inside it.
 *
 * `enabled={false}` is the one-step off switch: it restores the hero exactly
 * as it looked before, static backdrop included, with no scope and no motion.
 */

export function HeroAnimation({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const { appear, maskOnly, isIn } = heroInternals;

    const animated = Array.from(
      root.querySelectorAll<HTMLElement>(`.${appear}, .${maskOnly}`),
    );

    /*
     * Settle an element once its own animation has finished.
     *
     * Per element rather than one timer for the sequence: the delays are
     * staggered, and a single timeout would either clear early elements late
     * or late elements early. `once` so a re-run cannot stack listeners.
     */
    const settle = (element: HTMLElement) => element.classList.add(isIn);
    for (const element of animated) {
      element.addEventListener('animationend', () => settle(element), { once: true });
    }

    /*
     * The fallback that keeps the hero visible.
     *
     * If animations are disabled, unsupported, or were never scheduled — a
     * reduced-motion setting, a stylesheet that failed, an engine that does
     * not implement getAnimations — no animationend will ever fire and the
     * listeners above would wait forever. Two frames is enough for the engine
     * to have started anything it was going to start; after that, if nothing
     * is running, the elements are settled by hand.
     *
     * Resting opacity is already 1, so this is belt and braces rather than
     * the thing standing between the visitor and a blank page.
     */
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const running = animated.some((element) =>
          typeof element.getAnimations === 'function'
            ? element
                .getAnimations()
                .some((a) => a.playState === 'running' || a.playState === 'finished')
            : false,
        );
        if (!running) animated.forEach(settle);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  /*
   * The off switch.
   *
   * It renders the children with no scope and no motion, alongside the exact
   * static backdrop the hero carried before this component existed — so
   * `enabled={false}` restores the previous appearance rather than merely
   * removing the animation and the backdrop with it. The `appear` classes the
   * children still carry only match inside the scope, so they go inert on
   * their own.
   */
  if (!enabled) {
    return (
      <>
        <div aria-hidden className="grid-backdrop absolute inset-0 opacity-60" />
        {children}
      </>
    );
  }

  return (
    <div ref={ref} className={heroInternals.scope}>
      {/*
        Decoration only, and announced as such. The drifting grid reuses the
        existing .grid-backdrop so the pattern and its --grid colour stay
        identical to the rest of the site; this adds movement, not a new look.
      */}
      <div aria-hidden className={`grid-backdrop ${heroInternals.backdrop}`} />
      <div aria-hidden className={heroInternals.glow} />
      <div className="relative">{children}</div>
    </div>
  );
}
