import type { PlanId } from '@/lib/db/types';

/**
 * Direct Lemon Squeezy checkout links.
 *
 * WHY
 * ---
 * `POST /api/checkout` creates a checkout through the Lemon Squeezy API and
 * returns its URL. That is a serverless invocation (cold start) plus a
 * third-party API round trip before the browser can even begin navigating —
 * seconds, on the click that matters most. A direct link navigates instantly.
 *
 * THE CATCH, AND WHY THESE URLS ARE BUILT RATHER THAN PASTED
 * ----------------------------------------------------------
 * The API route sends `custom_data.plan` with the checkout, and the webhook's
 * `license_key_created` handler resolves the customer's plan from *only* that
 * field. A bare buy link carries no custom data, so a purchase through one
 * would arrive with no resolvable plan: the handler logs, returns 200, and
 * provisions nothing. The customer pays and receives no licence.
 *
 * So every link here has `checkout[custom][plan]` appended. Lemon Squeezy
 * passes that through to the webhook in the same place the API route puts it,
 * which keeps provisioning working and keeps the two paths identical from the
 * webhook's point of view. Do not hand out raw buy links alongside these.
 *
 * CONFIGURATION
 * -------------
 * Set the full buy URL for each plan, copied from Lemon Squeezy → Products →
 * the variant → Share. They must be NEXT_PUBLIC_ to be readable in the
 * browser, and they are not secrets — they are public purchase pages.
 *
 *   NEXT_PUBLIC_LS_BUY_SINGLE=https://<store>.lemonsqueezy.com/buy/<uuid>
 *   NEXT_PUBLIC_LS_BUY_PACK=https://<store>.lemonsqueezy.com/buy/<uuid>
 *   NEXT_PUBLIC_LS_BUY_AGENCY=https://<store>.lemonsqueezy.com/buy/<uuid>
 *
 * Note the path takes the variant's UUID, not the numeric variant ID used by
 * LEMONSQUEEZY_VARIANT_*. They are different identifiers for the same thing.
 *
 * Any plan left unset falls back to the API route, so a partial configuration
 * is safe: those plans are merely slower, never broken.
 */

/*
 * Referenced as literal property accesses because Next.js inlines
 * NEXT_PUBLIC_* at build time by static analysis — `process.env[name]` with a
 * computed key yields undefined in the browser bundle.
 */
const RAW_LINKS: Record<PlanId, string | undefined> = {
  single: process.env.NEXT_PUBLIC_LS_BUY_SINGLE,
  pack: process.env.NEXT_PUBLIC_LS_BUY_PACK,
  agency: process.env.NEXT_PUBLIC_LS_BUY_AGENCY,
};

function isUsableLink(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('lemonsqueezy.com');
  } catch {
    return false;
  }
}

/**
 * The direct checkout URL for a plan, with the custom data the webhook needs,
 * or null when the plan is not configured for direct checkout.
 */
export function directCheckoutUrl(plan: PlanId): string | null {
  const raw = RAW_LINKS[plan];
  if (!isUsableLink(raw)) return null;

  const url = new URL(raw);
  // The exact key the API route sends, so the webhook cannot tell them apart.
  url.searchParams.set('checkout[custom][plan]', plan);
  // Skip the "are you sure" interstitial some stores enable.
  url.searchParams.set('embed', '0');
  return url.toString();
}

/** True when at least one plan can skip the API round trip. */
export function hasAnyDirectCheckout(): boolean {
  return (Object.keys(RAW_LINKS) as PlanId[]).some((plan) => directCheckoutUrl(plan) !== null);
}
