import type { PlanId } from '@/lib/db/types';
import { PRODUCTION_ORIGIN } from '@/lib/site-url';

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
 *   NEXT_PUBLIC_LS_BUY_SINGLE=https://checkout.usecrawlable.com/buy/<uuid>
 *   NEXT_PUBLIC_LS_BUY_PACK=https://checkout.usecrawlable.com/buy/<uuid>
 *   NEXT_PUBLIC_LS_BUY_AGENCY=https://checkout.usecrawlable.com/buy/<uuid>
 *
 * (The <store>.lemonsqueezy.com form of the same links works too.)
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

/**
 * The store's custom checkout domain: checkout.<production host>.
 *
 * Derived rather than configured, so it cannot drift from the site's own
 * domain. It has to be allowed explicitly — the check below used to accept
 * only *.lemonsqueezy.com, so a buy link on checkout.usecrawlable.com was
 * silently rejected and every "direct" purchase fell back to the slower API
 * round trip without anyone noticing.
 */
const CUSTOM_CHECKOUT_HOST = `checkout.${new URL(PRODUCTION_ORIGIN).hostname}`;

/**
 * Whether a configured link may be sent to a customer.
 *
 * An allowlist, because this is a URL the site tells people to enter card
 * details into: a typo or a pasted wrong link in an environment variable must
 * not be able to send a buyer to an arbitrary host. Either Lemon Squeezy's own
 * domain or our custom checkout domain, over HTTPS, and nothing else.
 */
export function isUsableLink(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host === 'lemonsqueezy.com' ||
      host.endsWith('.lemonsqueezy.com') ||
      host === CUSTOM_CHECKOUT_HOST
    );
  } catch {
    return false;
  }
}

/**
 * Show the store logo on every checkout, explicitly.
 *
 * `logo=0` was set here in the belief that the logo was the link out to the
 * Lemon Squeezy storefront. Measured against the live checkout, it is not:
 *
 *   - In the overlay (embed=1) the logo is a plain avatar — not wrapped in a
 *     link, no click handler. Clicking it does nothing. Hiding it removed the
 *     brand mark from the card and protected against nothing.
 *   - On the full-page checkout the avatar is equally inert. The storefront
 *     link is the store NAME beside it ("Crawlable" → the checkout domain's
 *     root, same tab), and that link is there with logo=0 or without it. No
 *     URL parameter removes it; that page is only reached when Lemon.js is
 *     blocked, and the fix for it lives in the Lemon Squeezy store settings.
 *
 * Set to 1 rather than merely left off, so the logo shows even if a product's
 * own checkout settings hide it. The API route sets checkout_options.logo the
 * same way.
 */
function applyDisplayParams(url: URL): void {
  url.searchParams.set('logo', '1');
}

/**
 * Where a customer lands after paying.
 *
 * One definition for both routes: the API checkout's redirect_url, and the
 * page the overlay sends people to when they close the receipt. The origin is
 * the production constant, not the resolved site URL — a return link is a
 * statement about where the customer's dashboard lives, and it lives here.
 */
export const POST_PURCHASE_PATH = '/dashboard?purchase=success';

export function postPurchaseUrl(): string {
  return `${PRODUCTION_ORIGIN}${POST_PURCHASE_PATH}`;
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
  applyDisplayParams(url);
  /*
   * Deliberately NO embed parameter here, and the old `embed=0` is gone.
   *
   * This URL is the anchor's href — the path taken only when the overlay
   * cannot open (Lemon.js blocked or not yet loaded). Setting embed=0 forced
   * that full-page navigation even when the overlay was available, which was
   * the first way customers ended up stranded on the checkout domain.
   *
   * embed=1 does not belong here either. The embedded layout closes itself by
   * posting a message to a parent window; loaded as a top-level page there is
   * no parent, so its close button does nothing. overlayCheckoutUrl adds
   * embed=1 only on the URL that actually goes into the overlay iframe.
   */
  url.searchParams.delete('embed');
  return url.toString();
}

/**
 * The URL to open inside the Lemon.js overlay.
 *
 * Lemon.js sets embed=1 itself when it opens a URL (its Url.Build), so this is
 * belt and braces — but it makes the overlay URL correct on its own terms
 * rather than dependent on a third-party script's internals, and it applies
 * the display parameters to URLs that did not come from directCheckoutUrl,
 * such as a checkout created through the API.
 */
export function overlayCheckoutUrl(checkoutUrl: string): string {
  const url = new URL(checkoutUrl);
  applyDisplayParams(url);
  url.searchParams.set('embed', '1');
  return url.toString();
}

/** True when at least one plan can skip the API round trip. */
export function hasAnyDirectCheckout(): boolean {
  return (Object.keys(RAW_LINKS) as PlanId[]).some((plan) => directCheckoutUrl(plan) !== null);
}
