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

export const PLANS: readonly Plan[] = [
  {
    id: 'single',
    name: 'Single audit',
    price: '$39',
    priceNote: 'one-time',
    auditQuota: 1,
    recurring: false,
    tagline: 'One site, fully audited, with the fix files.',
    features: [
      'Up to 40 pages crawled as a non-rendering crawler sees them',
      'Per-page raw-HTML readability verdict',
      'AI crawler policy check across 15 bots',
      'Structured data, heading and metadata audit',
      'Generated llms.txt, robots.txt and JSON-LD',
      'FIXES.md prioritised by revenue impact',
    ],
    highlight: false,
    cta: 'Audit my site',
  },
  {
    id: 'pack',
    name: 'Agency pack',
    price: '$99',
    priceNote: 'one-time, 5 audits',
    auditQuota: 5,
    recurring: false,
    tagline: 'Five client audits at half the per-site price.',
    features: [
      'Everything in Single audit, five times',
      'Credits never expire',
      'Re-run an audit to show before and after',
      'Share a report by link with no login',
      'Priority email support',
    ],
    highlight: true,
    cta: 'Get 5 audits',
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$29',
    priceNote: 'per month',
    auditQuota: null,
    recurring: true,
    tagline: 'Unlimited audits under your own brand.',
    features: [
      'Unlimited audits, unlimited sites',
      'White-label reports with your name and colour',
      'Re-audit clients monthly to prove progress',
      'API access for your own dashboards',
      'Cancel any time',
    ],
    highlight: false,
    cta: 'Start white-labelling',
  },
] as const;

export function planById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function isPlanId(value: string): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}
