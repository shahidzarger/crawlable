/**
 * Third-party prices quoted in marketing copy.
 *
 * Here rather than inline in a component for one reason: a number we assert
 * about somebody else's product is the most quotable thing on the page and the
 * first thing a sceptical reader checks. Keeping it in one place with its
 * source and the date it was verified makes it possible to re-check, and makes
 * a stale figure visible rather than buried in JSX.
 *
 * VERIFIED 26 September 2026, from the vendors' own pricing pages:
 *
 *   Ahrefs   (ahrefs.com/pricing)        Lite $129, Standard $249,
 *                                        Advanced $449, Enterprise $1,499 /mo.
 *                                        A limited $29 Starter tier also exists;
 *                                        it is a keyword-research plan, not a
 *                                        site-audit suite, so it is outside the
 *                                        range below.
 *   Semrush  (semrush.com/pricing)       SEO $139, Starter $199, Pro+ $299,
 *                                        Advanced $549 /mo at monthly billing.
 *
 * The range therefore spans the standard paid tiers of the two tools this
 * product is most often compared against. Re-verify before changing it, and
 * update the date when you do.
 */

export const SEO_SUITE_PRICE_RANGE = '$129–$549';
export const SEO_SUITE_PRICE_PROSE = '$129 to $549';
export const SEO_SUITE_VERIFIED_ON = '26 September 2026';
