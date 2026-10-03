/**
 * The Crawlable square mark: a sharp-cornered emerald square beside the
 * wordmark, as in every brand asset (18px square to a 24px/800 wordmark —
 * a 0.75 ratio, kept here by sizing the square in em).
 *
 * Square means square: no radius at any size, which is why it is its own
 * component rather than a utility class someone can round later.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`brand-mark ${className}`} style={{ width: '0.75em', height: '0.75em' }} />
  );
}
