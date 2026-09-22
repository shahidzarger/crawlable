import type { PlanId } from '@/lib/db/types';

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  priceNote: string;
  /** Audits granted. Null means unmetered. */
  auditQuota: number | null;
  recurring: boolean;
  tagline: string;
  features: string[];
  highlight: boolean;
  cta: string;
}

/**
 * The plan catalogue.
 *
 * `auditQuota` is the only field with teeth: it is what the webhook grants and
 * what spendCredit meters against, and it is read from here rather than from
 * any payment payload. Everything else is display copy.
 *
 * `price` is DISPLAY ONLY. The amount actually charged comes from the Lemon
 * Squeezy variant, so changing a price here without changing it there shows
 * the customer one number and bills them another.
 */
export const PLANS: readonly Plan[] = [
  {
    id: 'single',
    name: 'Single Audit',
    price: '$39',
    priceNote: 'one-time',
    auditQuota: 1,
    recurring: false,
    tagline: 'One site, fully audited, with the fix files.',
    features: [
      'One full audit, up to 40 pages',
      'Crawled as a non-rendering AI crawler sees it',
      'AI crawler policy check across 15 bots',
      'Complete fix kit: llms.txt, robots.txt, JSON-LD',
      'FIXES.md prioritised by impact',
      'Credit never expires',
    ],
    highlight: false,
    cta: 'Audit my site',
  },
  {
    id: 'pack',
    name: 'Growth Pack',
    price: '$89',
    priceNote: 'one-time, 5 audits',
    auditQuota: 5,
    recurring: false,
    tagline: 'Five audits at $17.80 each — staging, production and competitors.',
    features: [
      'Five full audits — $17.80 per audit',
      'Audit staging, production and your competitors',
      'Credits never expire, use them whenever',
      'Re-run any site to show before and after',
      'Share a report by link, no login needed',
      'Priority email support',
    ],
    highlight: true,
    cta: 'Get 5 audits',
  },
  {
    id: 'agency',
    name: 'Agency Pro',
    price: '$29',
    priceNote: 'per month',
    auditQuota: null,
    recurring: true,
    tagline: 'Unlimited audits, for agencies auditing continuously.',
    features: [
      'Unlimited audits, unlimited sites',
      'Complete fix kit on every audit',
      'Full audit history in one dashboard',
      'Re-audit clients monthly to prove progress',
      'Cancel any time',
    ],
    highlight: false,
    cta: 'Go unlimited',
  },
] as const;

export function planById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function isPlanId(value: string): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}
