'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import {
  LEMON_JS_SRC,
  createPostPurchaseListener,
  initLemonSqueezy,
  onCheckoutEvent,
} from '@/lib/lemon';

/**
 * Loads Lemon.js and wires the checkout overlay, on the pages that sell.
 *
 * Rendered by the components with a buy button (the pricing table and the
 * dashboard) rather than from the root layout, so the legal pages, the
 * crawler guides and every other route stay free of third-party script.
 * next/script de-duplicates by src, so rendering it in two places on one page
 * would still load it once.
 *
 * `onReady`, not `onLoad`: onLoad fires once, when the script first loads.
 * onReady fires then AND every time this component mounts again after a
 * client-side navigation — which is when the pricing table's buttons are new
 * DOM that Lemon.js has never seen. initLemonSqueezy is idempotent, so running
 * it on each mount is the point, not a cost.
 */
export function LemonSqueezyScript() {
  /*
   * What happens after a successful purchase.
   *
   * Lemon Squeezy keeps the overlay open on its own confirmation screen after
   * payment, and that screen is where the licence key is shown. Closing the
   * overlay the moment Checkout.Success arrives would take the key away from
   * the customer before they had read it — so nothing happens on success
   * except remembering it.
   *
   * When they then close the overlay, they are sent to the dashboard, where
   * the key is used. Without this, closing the receipt dropped them back on
   * the pricing table they had just bought from, with no indication of what
   * to do next. The path matches the redirect_url the API checkout uses, so
   * both routes land in the same place.
   */
  useEffect(
    () => onCheckoutEvent(createPostPurchaseListener((path) => window.location.assign(path))),
    [],
  );

  return (
    <Script
      src={LEMON_JS_SRC}
      strategy="afterInteractive"
      onReady={() => {
        initLemonSqueezy();
      }}
    />
  );
}
