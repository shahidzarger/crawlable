'use client';

import { PLANS } from '@/lib/plans';
import { SEVERITY } from '@/components/report/severity';
import { useCheckout } from '@/components/useCheckout';
import { SEO_SUITE_PRICE_PROSE } from '@/lib/benchmarks';
import { betaFreeDeepAudit } from '@/lib/config';
import { PAGE_LIMITS } from '@/lib/audit/types-limits';

/**
 * Pricing table.
 *
 * Choosing a plan creates a checkout on the server and sends the whole tab to
 * Lemon Squeezy's full-page checkout — the wide, two-column, branded layout.
 * It replaced the Lemon.js overlay, whose card is a fixed 400px. The way back
 * is the browser's own Back button: this is an ordinary navigation away from
 * usecrawlable.com, not a frame on top of it.
 */
export function Pricing() {
  /*
   * The tier being bought, the error if creating it failed, and the start
   * action. The lock (every tier inert while one is starting), the
   * back/forward-cache recovery and the request timeout all live in the hook,
   * shared with the dashboard's buy button.
   */
  const { start, pendingPlan: activeTierId, error } = useCheckout();
  const locked = activeTierId !== null;

  return (
    <section id="pricing" className="scroll-mt-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
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
          className="mx-auto mt-8 max-w-3xl rounded-lg border p-5 text-sm"
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
          className="mx-auto mt-6 max-w-lg rounded-lg border p-4 text-sm"
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
                className="absolute -top-2.5 left-6 rounded-md px-2.5 py-0.5 text-[11px] font-semibold"
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
              A button, not a link: the checkout does not exist until the click
              creates it, because a checkout made per click can carry the
              redirect and receipt options that a static buy link cannot.
              Creating it takes a server round trip, so the button says what is
              happening for the whole wait — and every tier locks, so a second
              click cannot start a second checkout.
            */}
            <button
              type="button"
              onClick={() => void start(plan.id)}
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
                  Redirecting to checkout…
                </>
              ) : (
                plan.cta
              )}
            </button>
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
