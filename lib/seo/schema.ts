import { PLANS } from '@/lib/plans';
import { SUPPORT_EMAIL } from '@/lib/support';
import { PRODUCTION_ORIGIN } from '@/lib/site-url';

/**
 * Site-wide structured data.
 *
 * Two nodes in one graph, emitted on every page from the root layout:
 *
 *   - Organization — who we are. Google uses this for the knowledge panel and
 *     for the logo shown beside search results.
 *   - SoftwareApplication — what we sell, with an Offer per plan.
 *
 * Three decisions worth knowing about:
 *
 * 1. Prices come from PLANS, never from literals here. Markup that disagrees
 *    with the page is worse than no markup: Google may surface the marked-up
 *    figure in a rich result, then drop the markup once it spots the mismatch.
 *    One source means the two cannot drift.
 *
 * 2. The @id values use PRODUCTION_ORIGIN rather than the resolved SITE_URL.
 *    An entity's identity is stable; it does not become a different company
 *    because the code is running on a preview alias.
 *
 * 3. There is no aggregateRating. Review markup for reviews that do not exist
 *    is a manual-action risk, and this product has no ratings yet.
 */

const ORGANIZATION_ID = `${PRODUCTION_ORIGIN}/#organization`;
const SOFTWARE_ID = `${PRODUCTION_ORIGIN}/#software`;

const DESCRIPTION =
  "Audit your site's visibility across ChatGPT Search, Claude, and Perplexity. " +
  'Get real-time crawl scores and automated Fix Kits.';

function offers() {
  return PLANS.map((plan) => {
    const base = {
      '@type': 'Offer' as const,
      name: plan.name,
      description: plan.tagline,
      price: plan.priceUsd.toFixed(2),
      priceCurrency: 'USD',
      url: `${PRODUCTION_ORIGIN}/#pricing`,
      availability: 'https://schema.org/InStock',
    };

    if (!plan.recurring) return { ...base, category: 'one-time purchase' };

    /*
     * A bare Offer cannot say "per month" — price 29 with no period reads as a
     * one-off $29, which undersells a subscription by a factor of twelve in
     * any surface that renders it. UnitPriceSpecification carries the billing
     * period, so the recurring plan gets one.
     */
    return {
      ...base,
      category: 'subscription',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: plan.priceUsd.toFixed(2),
        priceCurrency: 'USD',
        unitCode: 'MON',
        billingDuration: 1,
        billingIncrement: 1,
      },
    };
  });
}

export function siteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Crawlable',
        url: PRODUCTION_ORIGIN,
        logo: `${PRODUCTION_ORIGIN}/icon.png`,
        description: DESCRIPTION,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: SUPPORT_EMAIL,
          availableLanguage: 'English',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': SOFTWARE_ID,
        name: 'Crawlable',
        url: PRODUCTION_ORIGIN,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web-based',
        description: DESCRIPTION,
        publisher: { '@id': ORGANIZATION_ID },
        provider: { '@id': ORGANIZATION_ID },
        offers: offers(),
      },
    ],
  };
}

/**
 * Serialise a JSON-LD graph for inlining in a script tag.
 *
 * `</script>` inside a string literal would terminate the tag and turn the
 * rest of the payload into markup. Everything in these graphs is currently a
 * compile-time constant, so this is defence in depth — but the moment any of
 * it comes from a database or a customer, the escape is what stops the page
 * from becoming an injection point.
 */
export function serialiseJsonLd(graph: unknown): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}
