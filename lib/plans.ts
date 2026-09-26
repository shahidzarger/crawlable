import type { PlanId } from '@/lib/db/types';

export interface Plan {
  /**
   * Internal identifier, persisted on every licence row.
   *
   * These read oddly next to the display names now ('single' is Starter,
   * 'pack' is Growth) and that is deliberate: the value is written into the
   * database at purchase time, so renaming it would orphan every licence sold
   * under the old name. The name customers see lives in `name`.
   */
  id: PlanId;
  name: string;
  /** Short positioning line under the name. */
  kicker: string;
  /** Display price, e.g. "$29". Kept in step with priceUsd by tests/seo.test.ts. */
  price: string;
  /**
   * The same number, machine-readable, for schema.org Offer markup.
   *
   * Structured data that disagrees with the price on the page is worse than no
   * structured data at all — Google can surface the marked-up number in a rich
   * result and will drop the markup entirely once it notices the mismatch. So
   * this is the only number the JSON-LD reads, and a test asserts the two
   * agree.
   */
  priceUsd: number;
  priceNote: string;
  /**
   * Total scans the licence grants, counting the first audit.
   *
   * Starter sells "1 audit + 2 re-scans", which is 3 scans. Presenting it that
   * way to customers and storing it as one number is the only way the two
   * cannot drift: there is no separate re-scan budget to get out of step with
   * the audit budget.
   */
  totalScansAllowed: number;
  /** How many distinct domains the licence may register. */
  domainSlots: number;
  /** Days from purchase until the remaining scans expire. */
  windowDays: number;
  recurring: boolean;
  tagline: string;
  features: string[];
  highlight: boolean;
  cta: string;
}

/**
 * The plan catalogue.
 *
 * `totalScansAllowed`, `domainSlots` and `windowDays` are the fields with
 * teeth: the webhook grants from here and the audit route meters against here,
 * never against anything in a payment payload. A replayed or forged webhook
 * therefore cannot grant more than a plan sells.
 *
 * `price` is DISPLAY ONLY. The amount actually charged comes from the Lemon
 * Squeezy variant, so changing a price here without changing it there shows
 * the customer one number and bills them another.
 */
export const PLANS: readonly Plan[] = [
  {
    id: 'single',
    name: 'Starter',
    kicker: 'Fix & Verify',
    price: '$29',
    priceUsd: 29,
    priceNote: 'one-time',
    totalScansAllowed: 3,
    domainSlots: 1,
    windowDays: 30,
    recurring: false,
    tagline: 'For one website or web app you want cited, not ignored.',
    features: [
      '1 website or web app audited, up to 40 pages',
      'Fix Kit .zip: robots.txt, sitemap.xml, llms.txt, schema.jsonld',
      '2 verification re-scans included (30-day window)',
      'Re-scan from your report for a before-and-after score',
      'FIXES.md with deployment instructions',
    ],
    highlight: false,
    cta: 'Audit my site',
  },
  {
    id: 'pack',
    name: 'Growth',
    kicker: 'Growth',
    price: '$79',
    priceUsd: 79,
    priceNote: 'one-time, 3 domains',
    totalScansAllowed: 10,
    domainSlots: 3,
    windowDays: 60,
    recurring: false,
    tagline: 'For a small portfolio: production, staging and a second brand.',
    features: [
      'Up to 3 websites, web apps or client domains tracked',
      '10 total scans across those domains (60-day window)',
      'A complete Fix Kit for each of the 3 sites',
      'Re-scan any of them to prove a fix landed, without spending a slot',
      'Every Fix Kit re-downloadable from your dashboard',
    ],
    highlight: true,
    cta: 'Get the Growth pack',
  },
  {
    id: 'agency',
    name: 'Agency Pro',
    kicker: 'Agency Pro',
    price: '$199',
    priceUsd: 199,
    priceNote: 'one-time, 15 domains',
    totalScansAllowed: 50,
    domainSlots: 15,
    windowDays: 60,
    recurring: false,
    tagline: 'For consultants, agencies, and web developers.',
    features: [
      'Up to 15 client domains tracked — sites, stores or web apps',
      '50 total scans across the portfolio (60-day window)',
      'A Fix Kit per client site, generated from that site\'s own crawl',
      'Enough scans to audit a portfolio and verify every fix',
      'Report links you can send straight to a client',
    ],
    highlight: false,
    cta: 'Audit my client sites',
  },
] as const;

export function planById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function isPlanId(value: string): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

/**
 * Re-scans left after auditing every registered domain once.
 *
 * NOT totalScansAllowed - 1. That is only right for a single-domain plan:
 * Growth's ten scans cover three first audits before any verification, so
 * "9 re-scans included" overstates it by two. Copy that promises a number of
 * re-scans must use this, or say "scans" and mean it.
 */
export function verificationScans(plan: Plan): number {
  return Math.max(0, plan.totalScansAllowed - plan.domainSlots);
}
