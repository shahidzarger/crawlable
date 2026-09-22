'use client';

import { useEffect, useState } from 'react';
import { PLANS, type Plan } from '@/lib/plans';
import { SEVERITY } from '@/components/report/severity';
import { directCheckoutUrl } from '@/lib/checkout-links';

/** Pricing table. Each button creates a Lemon Squeezy checkout and redirects. */
export function Pricing() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Re-enable the buttons when the browser restores this page from the
   * back/forward cache.
   *
   * Clicking a plan sets `pending` and then navigates to Lemon Squeezy. If the
   * customer presses Back, the browser may restore this page from bfcache
   * rather than re-running it — the DOM and all React state come back exactly
   * as they were left, so `pending` is still set and every button is still
   * disabled and reading "Opening checkout…". The page looks broken, and the
   * customer cannot buy. On mobile Safari, where Back is a swipe, this is the
   * common path rather than the edge case.
   *
   * `pageshow` fires on every page display, including a bfcache restore, and
   * `persisted` is true only for that restore — a normal load leaves it false,
   * and in that case React state started empty anyway, so there is nothing to
   * reset.
   *
   * Only `pending` is cleared. `error` is left alone: it is null whenever a
   * navigation to checkout happened, so clearing it would be a no-op here, and
   * discarding a genuine error message the customer has not read yet would be
   * worse than leaving it.
   */
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setPending(null);
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  async function buy(plan: Plan) {
    setPending(plan.id);
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
        setPending(null);
        return;
      }

      window.location.href = payload.url;
    } catch {
      setError('Could not reach the checkout service. Try again in a moment.');
      setPending(null);
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
            className="surface-card relative flex flex-col p-6"
            style={
              plan.highlight
                ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }
                : undefined
            }
          >
            {plan.highlight ? (
              <span
                className="absolute -top-2.5 left-6 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Best value
              </span>
            ) : null}

            <h3 className="font-semibold">{plan.name}</h3>
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
              navigating on mousedown, with no fetch, no serverless cold start
              and no third-party API call in the way. There is no pending state
              to get stuck in either, which makes the bfcache problem moot for
              this path.

              An unconfigured plan keeps the original button and API round trip,
              so a partial configuration is slow rather than broken.
            */}
            {directCheckoutUrl(plan.id) ? (
              <a
                href={directCheckoutUrl(plan.id) ?? '#'}
                className={`mt-6 block w-full px-5 py-3 text-center text-sm ${
                  plan.highlight ? 'btn-primary' : 'btn-ghost'
                }`}
              >
                {plan.cta}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void buy(plan)}
                disabled={pending !== null}
                className={`mt-6 w-full px-5 py-3 text-sm ${
                  plan.highlight ? 'btn-primary' : 'btn-ghost'
                }`}
              >
                {pending === plan.id ? 'Opening checkout…' : plan.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs ink-muted">
        Paid through Lemon Squeezy, which acts as merchant of record and handles VAT and sales
        tax worldwide. Your license key arrives by email straight after payment.
      </p>
    </section>
  );
}
