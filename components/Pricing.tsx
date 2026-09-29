'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { PLANS, type Plan } from '@/lib/plans';
import { SEVERITY } from '@/components/report/severity';
import { directCheckoutUrl } from '@/lib/checkout-links';
import { onCheckoutEvent, openCheckoutOverlay, overlayAvailable } from '@/lib/lemon';
import { LemonSqueezyScript } from '@/components/LemonSqueezyScript';
import { SEO_SUITE_PRICE_PROSE } from '@/lib/benchmarks';
import { betaFreeDeepAudit } from '@/lib/config';
import { PAGE_LIMITS } from '@/lib/audit/types-limits';

/**
 * Pricing table. Selecting a plan opens the checkout in the Lemon.js overlay,
 * on top of this page — with a close button and no way to wander off to the
 * storefront. If Lemon.js is unavailable (blocked, or not loaded yet) the same
 * click falls back to the full-page checkout, so a buyer can always pay.
 */
export function Pricing() {
  /**
   * The tier the customer has committed to, or null.
   *
   * One piece of state drives both paths — the direct link and the API
   * fallback — so the lock behaves identically whichever is configured. It is
   * set synchronously in the click handler, before any await and before the
   * browser begins navigating, so the feedback is immediate rather than
   * arriving after a network round trip.
   */
  const [activeTierId, setActiveTierId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which wording the busy state uses: an overlay opens, a redirect leaves. */
  const [opensOverlay, setOpensOverlay] = useState(false);
  const locked = activeTierId !== null;

  /*
   * Never leave the tiers locked behind an overlay.
   *
   * The lock exists to stop a double purchase while the page is on its way
   * somewhere. An overlay is not a departure: the page stays, and when the
   * customer closes the overlay they must find the buttons working, not
   * frozen on "Opening checkout…" — which would be the stranding problem
   * reappearing in a new shape. 'mounted' also clears it, because by then the
   * overlay itself covers the page and blocks a second click.
   */
  useEffect(
    () =>
      onCheckoutEvent((event) => {
        if (event.type === 'mounted' || event.type === 'closed') setActiveTierId(null);
        /*
         * The checkout never appeared and the overlay was torn down. A buy
         * link has already been sent on to its full-page checkout by then; an
         * API checkout has nowhere safe to go, so the customer is told.
         */
        if (event.type === 'stalled') {
          setActiveTierId(null);
          setError('The checkout did not load. Please try again, or email support if it keeps happening.');
        }
      }),
    [],
  );

  /*
   * Re-enable the buttons when the browser restores this page from the
   * back/forward cache.
   *
   * Clicking a plan sets `activeTierId` and then navigates to the checkout. If
   * the customer presses Back, the browser may restore this page from bfcache
   * rather than re-running it — the DOM and all React state come back exactly
   * as they were left, so `activeTierId` is still set and all three tiers are
   * still locked and reading "Redirecting to checkout…". The page looks
   * broken, and the customer cannot buy. On mobile Safari, where Back is a
   * swipe, this is the common path rather than the edge case.
   *
   * `pageshow` fires on every page display, including a bfcache restore, and
   * `persisted` is true only for that restore — a normal load leaves it false,
   * and in that case React state started empty anyway, so there is nothing to
   * reset.
   *
   * Only the lock is cleared. `error` is left alone: it is null whenever a
   * navigation to checkout happened, so clearing it would be a no-op here, and
   * discarding a genuine error message the customer has not read yet would be
   * worse than leaving it.
   */
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setActiveTierId(null);
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  async function buy(plan: Plan) {
    /*
     * Decided once, at the click: whether Lemon.js is here to open an overlay.
     * The API creates the checkout in the matching mode — an embedded layout
     * for the overlay, a normal page for a redirect — because the embedded
     * one's close button only works inside the overlay's frame.
     */
    const overlay = overlayAvailable();
    setOpensOverlay(overlay);
    setActiveTierId(plan.id);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, overlay }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout. Try again in a moment.');
        setActiveTierId(null);
        return;
      }

      // No fallbackUrl: this checkout was created for the embedded layout.
      if (overlay && openCheckoutOverlay(payload.url, { fallbackUrl: null })) {
        setActiveTierId(null);
        return;
      }

      // Lemon.js unavailable (or vanished since the click): the full page
      // still takes payment. Paying must never depend on a third-party script.
      window.location.href = payload.url;
    } catch {
      setError('Could not reach the checkout service. Try again in a moment.');
      setActiveTierId(null);
    }
  }

  return (
    <section id="pricing" className="scroll-mt-20">
      <LemonSqueezyScript />
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay once, keep the files
        </h2>
        <p className="mt-3 ink-secondary">
          Legacy SEO suites charge {SEO_SUITE_PRICE_PROSE} a month, on a recurring retainer,
          to tell you what is broken. This tells you what AI can actually read of your site,
          hands you the files that fix it, and re-scans to prove they worked.
        </p>
      </div>

      {/*
        What the free tier includes, stated next to what the paid tiers add.
        Without this the badge on the hero promises a free deep audit and the
        pricing table appears to contradict it.
      */}
      {betaFreeDeepAudit() ? (
        <div
          className="mx-auto mt-8 max-w-3xl rounded-xl border p-5 text-sm"
          style={{ borderColor: 'var(--accent)' }}
        >
          <p className="font-semibold">
            <span aria-hidden>🚀</span> Public Beta — the diagnostic is free
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider ink-muted">
                Free Beta Audit
              </p>
              <ul className="mt-2 space-y-1 ink-secondary">
                <li>Full {PAGE_LIMITS.audit}-page diagnostic</li>
                <li>Raw-HTML extraction analysis</li>
                <li>AI crawler access checks</li>
                <li>No signup, no licence key</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider ink-muted">
                Fix Kit plans below
              </p>
              <ul className="mt-2 space-y-1 ink-secondary">
                <li>Automated code generation</li>
                <li>Downloadable .zip Fix Kit</li>
                <li>Re-scan validation credits</li>
                <li>Domain tracking across a portfolio</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mx-auto mt-6 max-w-lg rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--data-bad)' }}
        >
          <span aria-hidden style={{ color: 'var(--data-bad)' }}>
            {SEVERITY.critical.icon}{' '}
          </span>
          {error}
        </div>
      ) : null}

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            /*
              All three cards are identical at rest. The accent follows the
              cursor instead of being baked into one tier, which is handled
              entirely by .tier-card in globals.css — see the comment there for
              why this is not React state.

              The "Most popular" badge stays on the Growth tier: it carries the
              claim in words, so the emphasis never rested on colour alone and
              does not now depend on a hover a touch device never sends.
            */
            className="surface-card tier-card relative flex flex-col p-6"
          >
            {plan.highlight ? (
              <span
                className="absolute -top-2.5 left-6 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Most popular
              </span>
            ) : null}

            <h3 className="font-semibold">{plan.name}</h3>
            {plan.kicker !== plan.name ? (
              <p className="mt-0.5 text-xs uppercase tracking-wider ink-muted">
                {plan.kicker}
              </p>
            ) : null}
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
              <span className="text-sm ink-muted">{plan.priceNote}</span>
            </div>
            <p className="mt-2 text-sm ink-secondary">{plan.tagline}</p>

            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <span aria-hidden style={{ color: 'var(--data-good)' }}>
                    ✓
                  </span>
                  <span className="ink-secondary">{feature}</span>
                </li>
              ))}
            </ul>

            {/*
              A configured plan renders a real link, and the click decides what
              happens to it:

                - Lemon.js loaded → preventDefault and open the checkout in the
                  overlay. The customer never leaves this page; the overlay has
                  its own close button.
                - Lemon.js blocked or not yet loaded → the native link
                  navigation proceeds, to the full-page checkout. Slower to
                  leave, but a buyer can always pay.

              An explicit handler rather than Lemon.js's own
              `lemonsqueezy-button` class. That class binds a listener to
              whatever anchors exist when Lemon.js scans the page, so it misses
              buttons React renders later, and it would fire alongside this
              handler with no knowledge of the lock. Calling Url.Open directly
              is deterministic under hydration and re-rendering.

              An unconfigured plan keeps the button and API round trip, so a
              partial configuration is slow rather than broken.
            */}
            {directCheckoutUrl(plan.id) ? (
              <a
                href={directCheckoutUrl(plan.id) ?? '#'}
                /*
                  flushSync, not a plain setState.

                  React schedules a re-render asynchronously. A native anchor
                  navigation begins immediately, and the browser stops
                  committing frames for a document it is leaving — so the
                  scheduled render never runs and the customer sees no feedback
                  at all. Measured: without this, the DOM still reads the
                  original label when the navigation starts.

                  flushSync commits the update synchronously, inside the event
                  handler, before the browser acts on the click. The navigation
                  is still native and still instant — preventDefault would undo
                  the whole point of the direct link.
                */
                onClick={(event) => {
                  /*
                    A modified click (new tab, new window, download) is the
                    customer asking for the browser's own behaviour, so it
                    gets exactly that. It must not lock the tiers either: this
                    page is not going anywhere, and nothing would ever unlock
                    them — every card stuck on "Redirecting to checkout…".
                  */
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  ) {
                    return;
                  }

                  const href = event.currentTarget.href;
                  // If the overlay never loads, the full-page checkout is where to go.
                  if (openCheckoutOverlay(href, { fallbackUrl: href })) {
                    event.preventDefault();
                    return;
                  }

                  setOpensOverlay(false);
                  flushSync(() => setActiveTierId(plan.id));
                }}
                /*
                  An anchor ignores `disabled`, so a locked one is taken out of
                  the tab order and has pointer events removed — otherwise a
                  keyboard user could still fire a second checkout from a
                  control that looks inert.
                */
                aria-disabled={locked && activeTierId !== plan.id}
                aria-busy={activeTierId === plan.id}
                tabIndex={locked && activeTierId !== plan.id ? -1 : undefined}
                className={`btn-ghost tier-cta mt-6 flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm ${lockClass(
                  locked,
                  activeTierId === plan.id,
                )}`}
              >
                {activeTierId === plan.id ? (
                  <>
                    <Spinner />
                    {opensOverlay ? 'Opening checkout…' : 'Redirecting to checkout…'}
                  </>
                ) : (
                  plan.cta
                )}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void buy(plan)}
                disabled={locked}
                aria-busy={activeTierId === plan.id}
                className={`btn-ghost tier-cta mt-6 flex w-full items-center justify-center gap-2 px-5 py-3 text-sm ${lockClass(
                  locked,
                  activeTierId === plan.id,
                )}`}
              >
                {activeTierId === plan.id ? (
                  <>
                    <Spinner />
                    {opensOverlay ? 'Opening checkout…' : 'Redirecting to checkout…'}
                  </>
                ) : (
                  plan.cta
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs ink-muted">
        Your licence key arrives by email straight after payment.
      </p>
    </section>
  );
}

/**
 * Styling for the two locked states.
 *
 * The chosen tier stays at full opacity and shows a wait cursor — it is
 * working, not unavailable. The other two dim, because they genuinely cannot
 * be used until the redirect resolves one way or the other.
 */
function lockClass(locked: boolean, isActive: boolean): string {
  if (!locked) return '';
  return isActive
    ? 'cursor-wait'
    : 'pointer-events-none cursor-not-allowed opacity-60';
}

/** Motion is always paired with words saying what is happening, never alone. */
function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" />
    </svg>
  );
}
