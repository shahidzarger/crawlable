'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { PLANS, type Plan } from '@/lib/plans';
import { SEVERITY } from '@/components/report/severity';
import { directCheckoutUrl } from '@/lib/checkout-links';

/** Pricing table. Selecting a plan redirects to the hosted checkout. */
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
  const locked = activeTierId !== null;

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
    setActiveTierId(plan.id);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout. Try again in a moment.');
        setActiveTierId(null);
        return;
      }

      window.location.href = payload.url;
    } catch {
      setError('Could not reach the checkout service. Try again in a moment.');
      setActiveTierId(null);
    }
  }

  return (
    <section id="pricing" className="scroll-mt-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay once, keep the files
        </h2>
        <p className="mt-3 ink-secondary">
          The monitoring tools charge $95 to $500 a month to tell you what AI says about you.
          This tells you what AI can read, and hands you the fix.
        </p>
      </div>

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

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            /*
              The highlighted tier is raised out of the row on wide screens and
              ringed in the accent colour. The badge carries the claim in words,
              so the emphasis never rests on colour alone.
            */
            className={`surface-card relative flex flex-col p-6 ${
              plan.highlight ? 'lg:-mt-4 lg:mb-4 lg:p-7' : ''
            }`}
            style={
              plan.highlight
                ? {
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 2px var(--accent), 0 18px 40px -24px var(--accent)',
                  }
                : undefined
            }
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
              A configured plan renders a real link: the browser starts
              navigating on the click itself, with no fetch, no serverless cold
              start and no third-party API call in the way. The click handler
              does NOT preventDefault — it only records the choice, so the
              native navigation proceeds at full speed while the UI updates.

              An unconfigured plan keeps the original button and API round trip,
              so a partial configuration is slow rather than broken.
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
                onClick={() => flushSync(() => setActiveTierId(plan.id))}
                /*
                  An anchor ignores `disabled`, so a locked one is taken out of
                  the tab order and has pointer events removed — otherwise a
                  keyboard user could still fire a second checkout from a
                  control that looks inert.
                */
                aria-disabled={locked && activeTierId !== plan.id}
                aria-busy={activeTierId === plan.id}
                tabIndex={locked && activeTierId !== plan.id ? -1 : undefined}
                className={`mt-6 flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm ${
                  plan.highlight ? 'btn-primary' : 'btn-ghost'
                } ${lockClass(locked, activeTierId === plan.id)}`}
              >
                {activeTierId === plan.id ? (
                  <>
                    <Spinner />
                    Redirecting to checkout…
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
                className={`mt-6 flex w-full items-center justify-center gap-2 px-5 py-3 text-sm ${
                  plan.highlight ? 'btn-primary' : 'btn-ghost'
                } ${lockClass(locked, activeTierId === plan.id)}`}
              >
                {activeTierId === plan.id ? (
                  <>
                    <Spinner />
                    Redirecting to checkout…
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

/** Motion is paired with the words "Redirecting to checkout…", never alone. */
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
