/**
 * The Crawlable logo mark: the geometric "C" with the emerald square in its
 * mouth — the exact paths from the brand thumbnail asset, without the white
 * card frame and grid behind them.
 *
 * Inline SVG rather than an <img>, for two reasons: it costs no extra request
 * in the header of every page, and the "C" is drawn in currentColor, so it is
 * slate #0F172A on the light theme and flips to the light ink on the dark one
 * instead of vanishing into a near-black background. The square is always
 * the accent.
 *
 * The viewBox is cropped tight to the artwork (x 58–177, y 58–182 in the
 * asset's 240-unit space), so `height` sets the visible size exactly and the
 * width follows the mark's own 119:124 ratio.
 *
 * Decorative: the adjacent "Crawlable" text is the accessible name.
 */
export function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="58 58 119 124"
      height={size}
      width={(size * 119) / 124}
      className={`shrink-0 ${className}`}
    >
      <path
        fill="currentColor"
        d="M167.49 80.15A62 62 0 1 0 167.49 159.85L147.58 143.14A36 36 0 1 1 147.58 96.86Z"
      />
      <rect x="151" y="107" width="26" height="26" fill="var(--accent)" />
    </svg>
  );
}
