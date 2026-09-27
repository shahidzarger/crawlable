import styles from './HeroAnimation.module.css';

/*
 * Hero motion class names.
 *
 * This lives in its own module, deliberately WITHOUT 'use client', because
 * app/page.tsx is a server component. Next.js turns every export of a
 * 'use client' module into a client reference, so a plain object exported
 * from HeroAnimation.tsx reads back as undefined on the server — the classes
 * silently vanish from the rendered HTML and the hero renders unanimated,
 * with no error anywhere. A shared, non-client module is evaluated normally
 * on both sides, so both the server markup and the client wrapper see the
 * same hashed names.
 *
 * CSS Module keys type as `string | undefined` under noUncheckedIndexedAccess.
 * The fallbacks are never real hashed names, so a missing class matches
 * nothing rather than being hidden by a cast.
 */

const cls = (value: string | undefined, name: string): string =>
  value ?? `hero-${name}-missing`;

/** Names the client wrapper needs for its own markup and its listeners. */
export const heroInternals = {
  scope: cls(styles.scope, 'scope'),
  backdrop: cls(styles.backdrop, 'backdrop'),
  glow: cls(styles.glow, 'glow'),
  appear: cls(styles.appear, 'appear'),
  maskOnly: cls(styles.mask, 'mask'),
  isIn: cls(styles.isIn, 'is-in'),
} as const;

/** Class names for the hero's children, so the markup stays readable. */
export const heroMotion = {
  scale: `${heroInternals.appear} ${cls(styles.scale, 'scale')}`,
  soft: `${heroInternals.appear} ${cls(styles.soft, 'soft')}`,
  pop: `${heroInternals.appear} ${cls(styles.pop, 'pop')}`,
  btn: `${heroInternals.appear} ${cls(styles.btn, 'btn')}`,
  stat: `${heroInternals.appear} ${cls(styles.stat, 'stat')}`,
  /** Wrapper that clips, and the inner span that slides up inside it. */
  line: cls(styles.line, 'line'),
  mask: `${heroInternals.appear} ${heroInternals.maskOnly}`,
  stats: cls(styles.stats, 'stats'),
  statItem: cls(styles.statItem, 'stat-item'),
  statValue: cls(styles.statValue, 'stat-value'),
} as const;
