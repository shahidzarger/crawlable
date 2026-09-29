'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanId } from '@/lib/db/types';

/**
 * Start a checkout: create it on the server, then send the whole tab there.
 *
 * Shared by the pricing table and the dashboard so both buy buttons behave
 * identically — same loading state, same errors, same recovery.
 */

/**
 * How long to wait for the server to create a checkout before giving up.
 *
 * The route calls the Lemon Squeezy API; a hung upstream would otherwise leave
 * the button spinning forever with no way to retry. Generous, because a cold
 * start plus an API round trip can honestly take several seconds.
 */
export const CHECKOUT_REQUEST_TIMEOUT_MS = 20_000;

const GENERIC_ERROR = 'Could not start checkout. Try again in a moment.';

export function useCheckout() {
  /** The plan being bought, or null. Drives the button's loading state. */
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * A ref, not state, for the double-click guard. State updates are
   * asynchronous, so two clicks in the same frame would both read "not
   * pending" and create two checkouts. The ref is set synchronously.
   */
  const inFlight = useRef(false);

  /*
   * Unlock when the browser restores this page from the back/forward cache.
   *
   * The lock is deliberately left on once the tab starts navigating to the
   * checkout — the page is leaving, and a second click must not create a
   * second checkout. But pressing Back from the checkout can restore this page
   * from bfcache exactly as it was left: still locked, still reading
   * "Redirecting to checkout…", every button dead. `persisted` is true only
   * for that restore. On mobile Safari, where Back is a swipe, this is the
   * common path, not the edge case.
   */
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      inFlight.current = false;
      setPendingPlan(null);
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const start = useCallback(async (plan: PlanId, options: { email?: string } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingPlan(plan);
    setError(null);

    const fail = (message: string) => {
      inFlight.current = false;
      setPendingPlan(null);
      setError(message);
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, ...(options.email ? { email: options.email } : {}) }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        fail(payload.error ?? GENERIC_ERROR);
        return;
      }

      // The server only ever returns an https checkout URL; anything else is a
      // bug, and a payment page is not the place to find out by navigating.
      let target: URL;
      try {
        target = new URL(payload.url);
      } catch {
        fail(GENERIC_ERROR);
        return;
      }
      if (target.protocol !== 'https:') {
        fail(GENERIC_ERROR);
        return;
      }

      // The lock stays on: the tab is leaving for the checkout.
      window.location.href = target.toString();
    } catch (caught) {
      fail(
        caught instanceof DOMException && caught.name === 'AbortError'
          ? 'The checkout is taking too long to start. Please try again.'
          : 'Could not reach the checkout service. Try again in a moment.',
      );
    } finally {
      clearTimeout(timer);
    }
  }, []);

  return { start, pendingPlan, error };
}
