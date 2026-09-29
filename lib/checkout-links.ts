import { PRODUCTION_ORIGIN } from '@/lib/site-url';

/**
 * The URLs a checkout sends people back to.
 *
 * Every purchase is a checkout created per click by POST /api/checkout, and
 * opened as a full page. There are no static buy links any more: a link
 * cannot carry a redirect URL or receipt options, and the overlay they fed is
 * gone. (NEXT_PUBLIC_LS_BUY_* are no longer read and can be deleted.)
 *
 * The origin is the production constant, not the resolved site URL — these
 * are statements about where the customer's dashboard and our pricing live,
 * and they live here whatever deployment happened to create the checkout.
 */

/** Where a customer lands after paying: the API checkout's redirect_url. */
export const POST_PURCHASE_PATH = '/dashboard?purchase=success';

export function postPurchaseUrl(): string {
  return `${PRODUCTION_ORIGIN}${POST_PURCHASE_PATH}`;
}
